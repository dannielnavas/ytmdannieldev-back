export type SponsorBlockCategory =
  | 'sponsor'
  | 'intro'
  | 'outro'
  | 'interaction'
  | 'selfpromo'
  | 'music_offtopic'
  | 'preview'
  | 'poi_highlight'
  | 'filler'
  | 'exclusive_access'
  | 'chapter';

export type SponsorBlockActionType =
  'skip' | 'mute' | 'poi' | 'full' | 'chapter';

export interface SponsorBlockSegment {
  UUID: string;
  segment: [number, number]; // [startTime, endTime] in seconds
  category: SponsorBlockCategory | string;
  actionType: SponsorBlockActionType | string;
  locked: number;
  votes: number;
  videoDuration: number;
  description: string;
}

export interface SponsorBlockHashedVideo {
  videoID: string;
  segments: SponsorBlockSegment[];
}

export interface SponsorBlockSegmentSubmission {
  segment: [number, number];
  category: SponsorBlockCategory | string;
  actionType?: SponsorBlockActionType | string;
  description?: string;
}

export interface SponsorBlockSubmittedSegmentResponse {
  UUID: string;
  category: string;
  segment: [number, number];
}

export interface SponsorBlockUserInfo {
  userID: string;
  userName: string;
  minutesSaved: number;
  segmentCount: number;
  ignoredSegmentCount: number;
  viewCount: number;
  ignoredViewCount: number;
  warnings: number;
  warningReason?: string;
  reputation: number;
  vip: number;
  lastSegmentID: string;
  permissions?: Record<string, boolean>;
}

export interface SponsorBlockUserStats {
  userID: string;
  userName: string;
  overallStats: {
    minutesSaved: number;
    segmentCount: number;
  };
  categoryCount?: Record<string, number>;
  actionTypeCount?: Record<string, number>;
}

export interface SponsorBlockSegmentInfo {
  videoID: string;
  startTime: number;
  endTime: number;
  votes: number;
  locked: number;
  UUID: string;
  userID: string;
  timeSubmitted: number;
  views: number;
  category: string;
  service: string;
  actionType: string;
  videoDuration: number;
  hidden: number;
  reputation: number;
  shadowHidden: number;
  hashedVideoID: string;
  userAgent: string;
  description: string;
}

export interface SponsorBlockTotalStats {
  userCount: number;
  activeUsers: number;
  apiUsers: number;
  viewCount: number;
  totalSubmissions: number;
  minutesSaved: number;
}

export interface SponsorBlockLockCategories {
  categories: string[];
  reason: string;
  actionTypes?: string[];
}
