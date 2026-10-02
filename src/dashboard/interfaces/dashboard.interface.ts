import type { Track } from '../../playlist/entities/track.entity.js';

export interface DashboardKpis {
  totalLikes: number;
  totalDurationSeconds: number;
  totalMinutes: number;
  totalHours: number;
  uniqueArtists: number;
  favoriteArtist: string | null;
}

export interface EnrichedArtistItem {
  name: string;
  likesCount: number;
  totalDurationSeconds: number;
  imageUrl?: string;
  bio?: string;
  listeners?: string;
  tags?: string[];
  lastFmUrl?: string;
}

export interface GenreDistributionItem {
  genre: string;
  weight: number;
  percentage: number;
}

export interface RecommendedArtistItem {
  name: string;
  matchScore?: number;
  imageUrl?: string;
  sourceArtist: string;
  lastFmUrl?: string;
}

export interface PersonalDashboardData {
  kpis: DashboardKpis;
  topArtists: EnrichedArtistItem[];
  topGenres: GenreDistributionItem[];
  recentLikes: Track[];
  recommendations: RecommendedArtistItem[];
}

export interface DashboardResponse {
  hasPersonalData: boolean;
  activeView: 'personal' | 'youtube';
  personal: PersonalDashboardData | null;
  youtube?: any;
}
