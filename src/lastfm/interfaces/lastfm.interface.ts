export interface LastFmImage {
  '#text': string;
  size: 'small' | 'medium' | 'large' | 'extralarge' | 'mega' | '';
}

export interface LastFmTag {
  name: string;
  url?: string;
  count?: number;
}

export interface LastFmArtistInfo {
  name: string;
  mbid?: string;
  url: string;
  image?: LastFmImage[];
  stats?: {
    listeners: string;
    playcount: string;
  };
  bio?: {
    summary?: string;
    content?: string;
  };
  tags?: {
    tag: LastFmTag[] | LastFmTag;
  };
}

export interface LastFmSimilarArtist {
  name: string;
  match?: string;
  url?: string;
  image?: LastFmImage[];
}
