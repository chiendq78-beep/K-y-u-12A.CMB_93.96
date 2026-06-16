export interface Classmate {
  id: string;
  name: string;
  nickname?: string;
  role: string; // e.g., "Lớp trưởng", "Trùm quậy", "Nhạc sĩ lớp"
  group: string; // e.g., "Tổ 1", "Tổ 2", "Tổ 3", "Tổ 4", "Ban Cán Sự"
  avatarUrl: string;
  quote: string; // "Tâm sự lời chúc"
  funnyChat?: string; // "Câu trò chuyện vui vẻ"
  birthDate?: string;
  facebookUrl?: string;
}

export interface Comment {
  id: string;
  itemId: string; // ID of the collectivePhoto or memoryPhoto
  author: string; // Name of classmate/sender
  content: string; // The short message
  createdAt: any; // Firestore Timestamp
}

export interface CollectiveAlbum {
  id: string;
  name: string;
  description?: string;
  createdAt?: any;
}

export interface GuestbookEntry {
  id: string;
  sender: string;
  title: string;
  content: string;
  date?: string;
  bgStyle?: string; // "yellow" | "green" | "pink" | "blue"
  createdAt?: any;
}
