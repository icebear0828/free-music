import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger.js';
import { DATA_DIR } from '../utils/paths.js';

const isTest = process.env.NODE_ENV === 'test' || typeof (global as any).it === 'function';
const USERS_FILE = path.join(DATA_DIR, isTest ? 'users.test.json' : 'users.json');
const PLAY_STATS_FILE = path.join(DATA_DIR, isTest ? 'play-stats.test.json' : 'play-stats.json');

const JWT_SECRET = process.env.JWT_SECRET || 'music-app-default-secret-key-12345';

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export interface User {
  username: string;
  passwordHash: string;
  nickname: string;
  avatar: string;
  createdAt: string;
}

export interface PlayRecord {
  username: string; // "guest" or username
  songId: string;
  sourceId: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  playCount: number;
  lastPlayedAt: string;
  raw?: any;
}

class DbService {
  private users: User[] = [];
  private playRecords: PlayRecord[] = [];

  constructor() {
    this.loadData();
  }

  private loadData() {
    try {
      if (fs.existsSync(USERS_FILE)) {
        const content = fs.readFileSync(USERS_FILE, 'utf-8');
        this.users = JSON.parse(content);
      } else {
        this.users = [];
      }
    } catch (e) {
      logger.error('Failed to load users.json:', e);
      this.users = [];
    }

    try {
      if (fs.existsSync(PLAY_STATS_FILE)) {
        const content = fs.readFileSync(PLAY_STATS_FILE, 'utf-8');
        this.playRecords = JSON.parse(content);
      } else {
        this.playRecords = [];
      }
    } catch (e) {
      logger.error('Failed to load play-stats.json:', e);
      this.playRecords = [];
    }
  }

  private saveUsers() {
    try {
      fs.writeFileSync(USERS_FILE, JSON.stringify(this.users, null, 2), 'utf-8');
    } catch (e) {
      logger.error('Failed to save users.json:', e);
    }
  }

  private savePlayStats() {
    try {
      fs.writeFileSync(PLAY_STATS_FILE, JSON.stringify(this.playRecords, null, 2), 'utf-8');
    } catch (e) {
      logger.error('Failed to save play-stats.json:', e);
    }
  }

  // Hash password using native crypto sha256
  hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // Auth helper
  generateToken(username: string): string {
    const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const data = `${username}:${expiry}`;
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('hex');
    return Buffer.from(`${data}:${signature}`).toString('base64');
  }

  verifyToken(token: string): string | null {
    try {
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [username, expiryStr, signature] = decoded.split(':');
      if (!username || !expiryStr || !signature) return null;
      
      const expiry = parseInt(expiryStr, 10);
      if (Date.now() > expiry) return null; // expired
      
      const expectedData = `${username}:${expiry}`;
      const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(expectedData).digest('hex');
      
      if (signature === expectedSignature) {
        return username;
      }
    } catch (e) {
      // Ignore parsing errors
    }
    return null;
  }

  // User database management
  getUser(username: string): User | undefined {
    return this.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  }

  createUser(username: string, passwordPlain: string, nickname: string, avatar: string): User {
    const existing = this.getUser(username);
    if (existing) {
      throw new Error('用户名已存在');
    }

    const newUser: User = {
      username: username,
      passwordHash: this.hashPassword(passwordPlain),
      nickname: nickname || username,
      avatar: avatar || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(username)}`,
      createdAt: new Date().toISOString()
    };

    this.users.push(newUser);
    this.saveUsers();
    return newUser;
  }

  updateUserProfile(username: string, updates: { nickname?: string; avatar?: string }): User {
    const user = this.getUser(username);
    if (!user) {
      throw new Error('用户不存在');
    }

    if (updates.nickname !== undefined) user.nickname = updates.nickname;
    if (updates.avatar !== undefined) user.avatar = updates.avatar;

    this.saveUsers();
    return user;
  }

  // Play Statistics management
  recordPlay(username: string | null, song: { id: string; sourceId: string; title: string; artist: string; album?: string; cover?: string; raw?: any }) {
    const userKey = username || 'guest';
    const songId = String(song.id);
    const sourceId = String(song.sourceId || 'unknown');

    let record = this.playRecords.find(
      r => r.username.toLowerCase() === userKey.toLowerCase() && r.songId === songId
    );

    if (record) {
      record.playCount += 1;
      record.lastPlayedAt = new Date().toISOString();
      // Update metadata in case they changed
      record.title = song.title || record.title;
      record.artist = song.artist || record.artist;
      if (song.album) record.album = song.album;
      if (song.cover) record.cover = song.cover;
      if (song.raw) record.raw = song.raw;
    } else {
      record = {
        username: userKey,
        songId,
        sourceId,
        title: song.title || '未知歌名',
        artist: song.artist || '未知歌手',
        album: song.album || '',
        cover: song.cover || '',
        playCount: 1,
        lastPlayedAt: new Date().toISOString(),
        raw: song.raw
      };
      this.playRecords.push(record);
    }

    this.savePlayStats();
    return record;
  }

  getUserStats(username: string, limit = 50): PlayRecord[] {
    return this.playRecords
      .filter(r => r.username.toLowerCase() === username.toLowerCase())
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
  }

  getGlobalStats(limit = 50): { songId: string; sourceId: string; title: string; artist: string; album: string; cover: string; playCount: number; lastPlayedAt: string }[] {
    const totals = new Map<string, { songId: string; sourceId: string; title: string; artist: string; album: string; cover: string; playCount: number; lastPlayedAt: string }>();

    for (const r of this.playRecords) {
      const existing = totals.get(r.songId);
      if (existing) {
        existing.playCount += r.playCount;
        if (new Date(r.lastPlayedAt) > new Date(existing.lastPlayedAt)) {
          existing.lastPlayedAt = r.lastPlayedAt;
        }
      } else {
        totals.set(r.songId, {
          songId: r.songId,
          sourceId: r.sourceId,
          title: r.title,
          artist: r.artist,
          album: r.album,
          cover: r.cover,
          playCount: r.playCount,
          lastPlayedAt: r.lastPlayedAt
        });
      }
    }

    return Array.from(totals.values())
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, limit);
  }

  getSongPlayCount(songId: string, username?: string): { userPlayCount: number; globalPlayCount: number } {
    let userPlayCount = 0;
    let globalPlayCount = 0;

    const targetSongId = String(songId);

    for (const r of this.playRecords) {
      if (r.songId === targetSongId) {
        globalPlayCount += r.playCount;
        if (username && r.username.toLowerCase() === username.toLowerCase()) {
          userPlayCount += r.playCount;
        }
      }
    }

    return { userPlayCount, globalPlayCount };
  }
}

export const dbService = new DbService();
