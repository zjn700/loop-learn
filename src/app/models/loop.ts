export interface Loop {
  loopIndex: number; // For ordering
  name: string; // Optional name for the segment
  startTime: number; // Stored in seconds (float)
  endTime: number; // Stored in seconds (float)
  primaryText: string; // Original language / Question
  secondaryText: string; // Translation / Answer
}

export interface LoopList {
  listId?: string; // Firestore Document ID
  ownerId: string;
  title: string;
  description: string;
  videoId: string;
  videoUrl: string;
  isPublic: boolean; // R4.1
  language: string; // R5.1a
  skillLevel: string; // R5.1a
  createdAt: Date;
  //   createdAt: firebase.firestore.Timestamp | Date;
  loops: Loop[]; // R2.3
}
