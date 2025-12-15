export interface Loop {
  loopIndex: number; // For ordering
  name: string; // Optional name for the segment
  startTime: number; // Stored in seconds (float)
  endTime: number; // Stored in seconds (float)
  primaryText?: string; // Original language / Question
  secondaryText?: string; // Translation / Answer
}

export interface LoopList {
  id: string; // UUID (local) or Firestore ID (cloud)
  ownerId: string; // 'local-user' or auth ID
  title: string;
  description?: string;
  videoId: string;
  videoUrl?: string;

  // Metadata
  isPublic: boolean;
  language?: string;
  skillLevel?: string;
  tags?: string[];

  // Timestamps (support ISO string for JSON storage)
  createdAt: Date | string;
  updatedAt: Date | string;

  // Content
  loops: Loop[];

  // Schema version
  version?: number;
}
