import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { Users } from '../../../users/entities/user.entity.js';
import { Token } from '../../models/token.model.js';
import { UsersService } from '../../../users/services/users/users.service.js';
import { UpdateYoutubeCookiesDto } from '../../../users/dtos/user.dto.js';

export interface YoutubeProfileData {
  is_authenticated: boolean;
  is_youtube_premium: boolean;
  full_name: string | null;
  email: string | null;
  profile_image: string | null;
  youtube_handle: string | null;
  youtube_channel_id: string | null;
  youtube_cookies: string;
  youtube_data?: Record<string, any>;
}

@Injectable()
export class AuthService {
  constructor(
    private usersServices: UsersService,
    private jwtServices: JwtService,
  ) {}

  async validateUser(email: string, password: string) {
    // const user = await this.usersServices.findOneByEmail(email);
    // if (user) {
    //   const isMatch = await bcrypt.compare(password, user.password);
    //   if (isMatch) {
    //     const { password, ...result } = user;
    //     return result;
    //   }
    // }
    return null;
  }

  generateJWT(user: Users) {
    const payload: Token = { role: user.full_name ?? '', sub: user.user_id };
    return {
      access_token: this.jwtServices.sign(payload),
    };
  }

  /**
   * Procesa las cookies de YouTube y extrae toda la información disponible
   * (estado de suscripción Premium, nombre, imagen de perfil, correo y canal).
   */
  async loginCookie(data: UpdateYoutubeCookiesDto): Promise<Users> {
    const accountInfo = await this.extractYoutubeAccountInfo(
      data.youtube_cookies,
    );
    const user = await this.usersServices.create(accountInfo);
    return user;
  }

  /**
   * Analiza y normaliza cadenas de cookies en formatos comunes
   * (cabecera HTTP, JSON de extensiones o formato Netscape).
   */
  parseYTCookies(cookieString: string): {
    cookieString: string;
    cookies: Record<string, string>;
  } {
    return this.parseCookies(cookieString);
  }

  /**
   * Extrae toda la información de la cuenta usando las cookies contra la InnerTube API de YouTube/YouTube Music.
   */
  async extractYoutubeAccountInfo(
    cookieInput: string,
  ): Promise<YoutubeProfileData> {
    const { cookieString, cookies } = this.parseCookies(cookieInput);

    if (!cookieString || Object.keys(cookies).length === 0) {
      throw new BadRequestException(
        'Las cookies de YouTube están vacías o tienen un formato no válido.',
      );
    }

    // Consultamos la API interna de YouTube Music y YouTube Web en paralelo
    const [musicResult, ytResult] = await Promise.all([
      this.fetchAccountMenu(cookieString, cookies, 'WEB_REMIX'),
      this.fetchAccountMenu(cookieString, cookies, 'WEB'),
    ]);

    const musicParsed = this.parseAccountMenuData(musicResult);
    const ytParsed = this.parseAccountMenuData(ytResult);

    const isAuthenticated = Boolean(
      musicParsed?.isAuthenticated || ytParsed?.isAuthenticated,
    );

    if (!isAuthenticated) {
      throw new UnauthorizedException(
        'No se pudo autenticar con las cookies de YouTube. Verifica que la sesión esté activa y las cookies no hayan expirado.',
      );
    }

    const isPremium = Boolean(musicParsed?.isPremium || ytParsed?.isPremium);
    const fullName = musicParsed?.name || ytParsed?.name || null;
    const email = musicParsed?.email || ytParsed?.email || null;
    const profileImage = musicParsed?.avatar || ytParsed?.avatar || null;
    const youtubeHandle = musicParsed?.handle || ytParsed?.handle || null;
    const youtubeChannelId =
      musicParsed?.channelId || ytParsed?.channelId || null;

    return {
      is_authenticated: true,
      is_youtube_premium: isPremium,
      full_name: fullName,
      email,
      profile_image: profileImage,
      youtube_handle: youtubeHandle,
      youtube_channel_id: youtubeChannelId,
      youtube_cookies: cookieString,
      youtube_data: {
        music_menu: musicParsed?.rawMenu || null,
        youtube_menu: ytParsed?.rawMenu || null,
      },
    };
  }

  /**
   * Parsea cadenas de cookies en formato estándar 'k=v; k2=v2',
   * array JSON exportado por extensiones de navegador, o formato Netscape cookies.txt.
   */
  private parseCookies(input: string): {
    cookieString: string;
    cookies: Record<string, string>;
  } {
    if (!input || typeof input !== 'string') {
      return { cookieString: '', cookies: {} };
    }

    const trimmed = input.trim();
    const cookies: Record<string, string> = {};

    // 1. JSON Array (exportado por extensiones como Cookie-Editor / EditThisCookie)
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item?.name && item?.value !== undefined) {
              cookies[item.name] = String(item.value);
            }
          }
        }
      } catch {
        // Ignorar error y probar formatos de texto
      }
    }

    // 2. Formato Netscape cookies.txt (separado por tabulaciones)
    if (Object.keys(cookies).length === 0 && trimmed.includes('\t')) {
      const lines = trimmed.split('\n');
      for (const line of lines) {
        const lineTrim = line.trim();
        if (!lineTrim || lineTrim.startsWith('#')) continue;
        const parts = lineTrim.split('\t');
        if (parts.length >= 7) {
          const name = parts[5]?.trim();
          const value = parts[6]?.trim();
          if (name) {
            cookies[name] = value;
          }
        }
      }
    }

    // 3. Cadena estándar de cabecera 'nombre=valor; nombre2=valor2' (o saltos de línea)
    if (Object.keys(cookies).length === 0) {
      const pairs = trimmed.split(/[;\n]+/);
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx > -1) {
          const key = pair.slice(0, idx).trim();
          const val = pair.slice(idx + 1).trim();
          if (key) {
            cookies[key] = val;
          }
        }
      }
    }

    const cookieString = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');

    return { cookieString, cookies };
  }

  /**
   * Genera el encabezado SAPISIDHASH que requiere la InnerTube API de YouTube
   * cuando se autentica mediante cookies (SAPISID, __Secure-3PAPISID, etc.).
   */
  private generateSapisidHash(
    cookies: Record<string, string>,
    origin: string,
  ): string | null {
    const sapisid =
      cookies['SAPISID'] ||
      cookies['__Secure-3PAPISID'] ||
      cookies['__Secure-1PAPISID'] ||
      cookies['APISID'];

    if (!sapisid) return null;

    const timestamp = Math.floor(Date.now() / 1000);
    const hash = createHash('sha1')
      .update(`${timestamp} ${sapisid} ${origin}`)
      .digest('hex');

    return `SAPISIDHASH ${timestamp}_${hash}`;
  }

  /**
   * Consulta el endpoint de InnerTube (/youtubei/v1/account/account_menu)
   * emulando el cliente web correspondiente.
   */
  private async fetchAccountMenu(
    cookieString: string,
    cookiesMap: Record<string, string>,
    clientType: 'WEB_REMIX' | 'WEB',
  ): Promise<any> {
    const origin =
      clientType === 'WEB_REMIX'
        ? 'https://music.youtube.com'
        : 'https://www.youtube.com';
    const url = `${origin}/youtubei/v1/account/account_menu`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Origin: origin,
      Referer: `${origin}/`,
      Cookie: cookieString,
    };

    const authHeader = this.generateSapisidHash(cookiesMap, origin);
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    const body = {
      context: {
        client: {
          clientName: clientType,
          clientVersion:
            clientType === 'WEB_REMIX'
              ? '1.20240101.01.00'
              : '2.20240101.01.00',
          hl: 'es',
          gl: 'US',
        },
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * Extrae cadenas de texto formateadas de estructuras de InnerTube (runs o simpleText).
   */
  private extractText(obj: any): string | null {
    if (!obj) return null;
    if (typeof obj === 'string') return obj;
    if (obj.simpleText) return obj.simpleText;
    if (Array.isArray(obj.runs) && obj.runs.length > 0) {
      return obj.runs
        .map((r: any) => r?.text || '')
        .join('')
        .trim();
    }
    return null;
  }

  /**
   * Obtiene la URL de la miniatura de mayor resolución de un array de miniaturas.
   */
  private extractThumbnail(photo: any): string | null {
    if (
      !photo ||
      !Array.isArray(photo.thumbnails) ||
      photo.thumbnails.length === 0
    ) {
      return null;
    }
    const sorted = [...photo.thumbnails].sort(
      (a, b) => (b?.width || 0) - (a?.width || 0),
    );
    return sorted[0]?.url || null;
  }

  /**
   * Procesa la respuesta de account_menu para extraer los datos de perfil y el estado Premium.
   */
  private parseAccountMenuData(data: any) {
    const menu =
      data?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer;
    if (!menu) return null;

    const header = menu.header?.activeAccountHeaderRenderer;
    const isAuthenticated = Boolean(header);

    const name = this.extractText(header?.accountName);
    const email = this.extractText(header?.email);
    const handle = this.extractText(header?.channelHandle);
    const avatar = this.extractThumbnail(header?.accountPhoto);

    let channelId: string | null = null;
    let hasPremiumUpsell = false;
    let hasMembershipLink = false;

    const sections = menu.sections || [];
    for (const section of sections) {
      const items = section.multiPageMenuSectionRenderer?.items || [];
      for (const item of items) {
        const link = item.compactLinkRenderer;
        if (!link) continue;

        const title = this.extractText(link.title) || '';
        const browseId = link.navigationEndpoint?.browseEndpoint?.browseId;
        const url =
          link.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url ||
          link.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
          '';

        if (browseId && browseId.startsWith('UC')) {
          channelId = browseId;
        }

        // Detección de ofertas de suscripción (si existen, NO tiene premium)
        if (
          browseId === 'SPunlimited' ||
          url.includes('/music_premium') ||
          url.includes('/premium') ||
          link.icon?.iconType === 'UNLIMITED' ||
          /suscrib|get music premium|get youtube premium|obt[eé]n/i.test(title)
        ) {
          hasPremiumUpsell = true;
        }

        // Detección de membresías pagadas activas
        if (
          browseId === 'SPmemberships' ||
          url.includes('/paid_memberships') ||
          /membres|membership/i.test(title)
        ) {
          hasMembershipLink = true;
        }
      }
    }

    // Si el usuario está autenticado y NO tiene botones de oferta de compra (o tiene enlace de membresías activas)
    const isPremium = isAuthenticated
      ? !hasPremiumUpsell || hasMembershipLink
      : false;

    return {
      isAuthenticated,
      isPremium,
      name,
      email,
      handle,
      avatar,
      channelId,
      rawMenu: menu,
    };
  }
}
