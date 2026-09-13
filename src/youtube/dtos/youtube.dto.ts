export interface YoutubeThumbnailDto {
  url: string;
  width: number;
  height: number;
}

export interface YoutubeItemArtistDto {
  name: string;
  artistId: string | null;
}

export interface YoutubeHomeItemDto {
  type: 'SONG' | 'VIDEO' | 'PLAYLIST' | 'ALBUM' | 'ARTIST';
  name: string;
  videoId?: string;
  playlistId?: string;
  albumId?: string;
  artist: YoutubeItemArtistDto;
  thumbnails: YoutubeThumbnailDto[];
}

export interface YoutubeHomeSectionDto {
  title: string;
  contents: YoutubeHomeItemDto[];
}
