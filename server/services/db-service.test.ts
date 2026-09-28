import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { dbService } from './db-service';
import { DATA_DIR } from '../utils/paths';

const USERS_FILE = path.join(DATA_DIR, 'users.test.json');
const PLAY_STATS_FILE = path.join(DATA_DIR, 'play-stats.test.json');

describe('dbService', () => {
  beforeEach(() => {
    // Clear files before test
    if (fs.existsSync(USERS_FILE)) fs.unlinkSync(USERS_FILE);
    if (fs.existsSync(PLAY_STATS_FILE)) fs.unlinkSync(PLAY_STATS_FILE);
    
    // Reload internal database state by invoking loadData private method via casting
    (dbService as any).loadData();
  });

  afterEach(() => {
    if (fs.existsSync(USERS_FILE)) fs.unlinkSync(USERS_FILE);
    if (fs.existsSync(PLAY_STATS_FILE)) fs.unlinkSync(PLAY_STATS_FILE);
  });

  describe('User Authentication', () => {
    it('should register a new user successfully', () => {
      const user = dbService.createUser('testuser', 'password123', 'My Nickname', '');
      expect(user.username).toBe('testuser');
      expect(user.nickname).toBe('My Nickname');
      expect(user.passwordHash).toBe(dbService.hashPassword('password123'));
      expect(user.avatar).toContain('testuser');
    });

    it('should fail to register if user already exists', () => {
      dbService.createUser('testuser', 'password123', 'My Nickname', '');
      expect(() => {
        dbService.createUser('testuser', 'otherpass', 'Other Nickname', '');
      }).toThrow('用户名已存在');
    });

    it('should generate and verify tokens correctly', () => {
      dbService.createUser('testuser', 'password123', 'My Nickname', '');
      const token = dbService.generateToken('testuser');
      expect(token).toBeDefined();

      const verifiedUser = dbService.verifyToken(token);
      expect(verifiedUser).toBe('testuser');
    });

    it('should fail verification with invalid token', () => {
      const verifiedUser = dbService.verifyToken('invalid-token-here');
      expect(verifiedUser).toBeNull();
    });

    it('should update user profile successfully', () => {
      dbService.createUser('testuser', 'password123', 'My Nickname', '');
      const updated = dbService.updateUserProfile('testuser', { nickname: 'New Nickname', avatar: 'new-avatar-url' });
      expect(updated.nickname).toBe('New Nickname');
      expect(updated.avatar).toBe('new-avatar-url');

      const retrieved = dbService.getUser('testuser');
      expect(retrieved?.nickname).toBe('New Nickname');
    });
  });

  describe('Play Statistics', () => {
    const testSong1 = {
      id: 'song1',
      sourceId: 'xiaoyun',
      title: 'Song One',
      artist: 'Artist A',
      album: 'Album X',
      cover: 'cover-url-1'
    };

    const testSong2 = {
      id: 'song2',
      sourceId: 'xiaoqiu',
      title: 'Song Two',
      artist: 'Artist B',
      album: 'Album Y',
      cover: 'cover-url-2'
    };

    it('should record plays for guest', () => {
      dbService.recordPlay(null, testSong1);
      dbService.recordPlay(null, testSong1);
      
      const songCount = dbService.getSongPlayCount('song1');
      expect(songCount.globalPlayCount).toBe(2);
      expect(songCount.userPlayCount).toBe(0); // target user undefined
    });

    it('should record plays for user', () => {
      dbService.recordPlay('testuser', testSong1);
      dbService.recordPlay('testuser', testSong1);
      dbService.recordPlay('otheruser', testSong1);

      const songCount = dbService.getSongPlayCount('song1', 'testuser');
      expect(songCount.globalPlayCount).toBe(3);
      expect(songCount.userPlayCount).toBe(2);
    });

    it('should retrieve user top statistics sorted by play count', () => {
      dbService.recordPlay('testuser', testSong1);
      dbService.recordPlay('testuser', testSong2);
      dbService.recordPlay('testuser', testSong2);

      const stats = dbService.getUserStats('testuser');
      expect(stats.length).toBe(2);
      expect(stats[0].songId).toBe('song2');
      expect(stats[0].playCount).toBe(2);
      expect(stats[1].songId).toBe('song1');
      expect(stats[1].playCount).toBe(1);
    });

    it('should retrieve global statistics sorted by play count', () => {
      dbService.recordPlay('testuser', testSong1);
      dbService.recordPlay('otheruser', testSong1);
      dbService.recordPlay('testuser', testSong2);

      const stats = dbService.getGlobalStats();
      expect(stats.length).toBe(2);
      expect(stats[0].songId).toBe('song1');
      expect(stats[0].playCount).toBe(2);
      expect(stats[1].songId).toBe('song2');
      expect(stats[1].playCount).toBe(1);
    });
  });
});
