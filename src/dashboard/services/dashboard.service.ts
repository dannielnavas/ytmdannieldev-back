import { Injectable, Logger } from '@nestjs/common';
import { LikesService } from '../../playlist/services/likes/likes.service.js';
import { LastfmService } from '../../lastfm/services/lastfm.service.js';
import { YoutubeService } from '../../youtube/services/youtube.service.js';
import type {
  DashboardKpis,
  DashboardResponse,
  EnrichedArtistItem,
  GenreDistributionItem,
  PersonalDashboardData,
  RecommendedArtistItem,
} from '../interfaces/dashboard.interface.js';

const NOISE_TAGS = new Set([
  'seen live',
  'favorites',
  'favourite',
  'favourite songs',
  'all',
  'loved',
  'spotify',
  'owned',
  'albums i own',
  'my favorites',
  'check out',
  'beautiful',
  'awesome',
  'cool',
  'good',
]);

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    private readonly likesService: LikesService,
    private readonly lastfmService: LastfmService,
    private readonly youtubeService: YoutubeService,
  ) {}

  private cleanBio(bioSummary?: string): string {
    if (!bioSummary) return '';
    return bioSummary.replace(/<[^>]*>?/gm, '').trim();
  }

  private capitalize(text: string): string {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  async getDashboard(
    userId: number,
    options?: { includeYoutube?: boolean; refresh?: boolean },
  ): Promise<DashboardResponse> {
    const stats = await this.likesService.getUserStatsSummary(userId);

    // Si el usuario no tiene canciones con like: Dashboard de YouTube es el primario
    if (stats.totalLikes === 0) {
      let youtubeData: any = null;
      try {
        youtubeData = await this.youtubeService.getDashboardData(
          userId,
          options?.refresh || false,
        );
      } catch (ytError) {
        this.logger.warn(
          `No se pudo cargar feed de YouTube para usuario ${userId}: ${
            ytError instanceof Error ? ytError.message : String(ytError)
          }`,
        );
      }

      return {
        hasPersonalData: false,
        activeView: 'youtube',
        personal: null,
        youtube: youtubeData,
      };
    }

    // Si tiene canciones guardadas: Dashboard personal es el protagonista
    const personal = await this.getPersonalDashboard(userId, stats);

    let youtubeData: any = null;
    const shouldIncludeYoutube = options?.includeYoutube !== false;
    if (shouldIncludeYoutube) {
      try {
        youtubeData = await this.youtubeService.getDashboardData(
          userId,
          options?.refresh || false,
        );
      } catch (ytError) {
        this.logger.warn(
          `Feed secundario de YouTube omitido o no disponible para usuario ${userId}: ${
            ytError instanceof Error ? ytError.message : String(ytError)
          }`,
        );
      }
    }

    return {
      hasPersonalData: true,
      activeView: 'personal',
      personal,
      youtube: youtubeData,
    };
  }

  async getPersonalDashboard(
    userId: number,
    preloadedStats?: {
      totalLikes: number;
      totalDurationSeconds: number;
      uniqueArtistsCount: number;
    },
  ): Promise<PersonalDashboardData> {
    const stats =
      preloadedStats ?? (await this.likesService.getUserStatsSummary(userId));
    const rawTopArtists = await this.likesService.getTopArtists(userId, 5);
    const recentLikes = await this.likesService.getRecentLikes(userId, 6);

    const kpis: DashboardKpis = {
      totalLikes: stats.totalLikes,
      totalDurationSeconds: stats.totalDurationSeconds,
      totalMinutes: Math.round(stats.totalDurationSeconds / 60),
      totalHours: Number((stats.totalDurationSeconds / 3600).toFixed(1)),
      uniqueArtists: stats.uniqueArtistsCount,
      favoriteArtist: rawTopArtists[0]?.artist || null,
    };

    // Enriquecer top artistas con Last.fm en paralelo
    const enrichedArtists: EnrichedArtistItem[] = await Promise.all(
      rawTopArtists.map(async (item) => {
        const info = await this.lastfmService.getArtistInfo(item.artist);
        const tags = await this.lastfmService.getArtistTopTags(item.artist);

        const cleanTags = tags
          .filter((t) => !NOISE_TAGS.has(t.name.toLowerCase()))
          .slice(0, 4)
          .map((t) => this.capitalize(t.name));

        const bestImage = this.lastfmService.extractBestImage(info?.image);

        return {
          name: item.artist,
          likesCount: item.likesCount,
          totalDurationSeconds: item.totalDuration,
          imageUrl: bestImage || undefined,
          bio: this.cleanBio(info?.bio?.summary),
          listeners: info?.stats?.listeners,
          tags: cleanTags,
          lastFmUrl: info?.url,
        };
      }),
    );

    // Calcular distribución de géneros ponderada con Last.fm
    const topGenres = await this.calculateGenreDistribution(rawTopArtists);

    // Generar recomendaciones basadas en los artistas favoritos
    const recommendations = await this.generateRecommendations(rawTopArtists);

    return {
      kpis,
      topArtists: enrichedArtists,
      topGenres,
      recentLikes,
      recommendations,
    };
  }

  private async calculateGenreDistribution(
    topArtists: Array<{ artist: string; likesCount: number }>,
  ): Promise<GenreDistributionItem[]> {
    if (!topArtists || topArtists.length === 0) return [];

    const genreWeights = new Map<string, number>();

    await Promise.all(
      topArtists.map(async (artistItem) => {
        const tags = await this.lastfmService.getArtistTopTags(
          artistItem.artist,
        );
        const validTags = tags.filter(
          (t) => !NOISE_TAGS.has(t.name.toLowerCase()),
        );

        // Ponderar por cantidad de likes y posición del tag
        for (let i = 0; i < Math.min(validTags.length, 3); i++) {
          const tagName = this.capitalize(validTags[i].name);
          const tagWeight = (3 - i) * artistItem.likesCount;
          genreWeights.set(
            tagName,
            (genreWeights.get(tagName) || 0) + tagWeight,
          );
        }
      }),
    );

    const sorted = Array.from(genreWeights.entries())
      .map(([genre, weight]) => ({ genre, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 6);

    const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight === 0) return [];

    return sorted.map((item) => ({
      genre: item.genre,
      weight: item.weight,
      percentage: Math.round((item.weight / totalWeight) * 100),
    }));
  }

  private async generateRecommendations(
    topArtists: Array<{ artist: string }>,
  ): Promise<RecommendedArtistItem[]> {
    if (!topArtists || topArtists.length === 0) return [];

    const existingNames = new Set(
      topArtists.map((a) => a.artist.toLowerCase()),
    );
    const recommendations: RecommendedArtistItem[] = [];

    // Tomar los 2 artistas principales para buscar similares
    const seedArtists = topArtists.slice(0, 2);

    for (const seed of seedArtists) {
      const similar = await this.lastfmService.getSimilarArtists(
        seed.artist,
        5,
      );

      for (const sim of similar) {
        const normalized = sim.name.toLowerCase();
        if (
          !existingNames.has(normalized) &&
          !recommendations.some((r) => r.name.toLowerCase() === normalized)
        ) {
          const bestImage = this.lastfmService.extractBestImage(sim.image);
          recommendations.push({
            name: sim.name,
            matchScore: sim.match ? parseFloat(sim.match) : undefined,
            imageUrl: bestImage || undefined,
            sourceArtist: seed.artist,
            lastFmUrl: sim.url,
          });
          existingNames.add(normalized);
        }

        if (recommendations.length >= 6) break;
      }
      if (recommendations.length >= 6) break;
    }

    return recommendations;
  }
}
