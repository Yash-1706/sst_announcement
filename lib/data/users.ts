import { eq } from 'drizzle-orm';
import { desc } from 'drizzle-orm';
import { getDb } from '../config/db';
import { users } from '../schema';
import type { UserRole } from '../types/index';
import { getYearMetadataFromEmail } from '@/utils/studentYear';

export async function findOrCreateUser(clerkId: string, email: string, displayName?: string) {
  const db = getDb();
  const existingUser = await db.select().from(users).where(eq(users.clerkId, clerkId)).limit(1);

  if (existingUser.length > 0) {
    const [updatedUser] = await db
      .update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.id, existingUser[0].id!))
      .returning();
    return mapUser(updatedUser);
  }

  const [newUser] = await db
    .insert(users)
    .values({
      clerkId,
      email,
      username: displayName || null,
      role: 'user',
      lastLogin: new Date(),
    })
    .returning();

  return mapUser(newUser);
}

export async function updateUserEmail(userId: number, newEmail: string) {
  const db = getDb();
  const [updatedUser] = await db
    .update(users)
    .set({ email: newEmail })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new Error('User not found');
  }

  return mapUser(updatedUser);
}

export async function getUserById(userId: number) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return user ? mapUser(user) : null;
}

export async function getAllUsers() {
  const db = getDb();
  const result = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
      username: users.username,
      role: users.role,
      createdAt: users.createdAt,
      lastLogin: users.lastLogin,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return result.map((user): any => {
    const yearMetadata = getYearMetadataFromEmail(user.email);
    return {
      id: user.id,
      clerk_id: user.clerkId,
      email: user.email,
      username: user.username,
      role: (user as any).role || 'student',
      is_admin:
        (user as any).role === 'admin' ||
        (user as any).role === 'super_admin' ||
        (user as any).role === 'student_admin',
      created_at: user.createdAt,
      last_login: user.lastLogin,
      intake_year: yearMetadata?.intakeYear ?? null,
      year_level: yearMetadata?.yearLevel ?? null,
    };
  });
}

export async function updateUserAdminStatus(userId: number, isAdmin: boolean) {
  const role: UserRole = isAdmin ? 'admin' : 'student';
  return updateUserRole(userId, role);
}

export async function updateUserRole(userId: number, role: UserRole) {
  const db = getDb();
  const [updatedUser] = await db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new Error('User not found');
  }

  return mapUser(updatedUser);
}

export async function getUserByEmail(email: string) {
  const db = getDb();
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ? mapUser(user) : null;
}

export function mapUser(user: typeof users.$inferSelect) {
  const role = (user as any).role || 'user';
  const yearMetadata = getYearMetadataFromEmail(user.email);
  return {
    id: user.id,
    clerk_id: user.clerkId,
    email: user.email,
    username: user.username,
    role,
    is_admin: role === 'admin' || role === 'super_admin' || role === 'student_admin',
    created_at: user.createdAt,
    last_login: user.lastLogin,
    intake_year: yearMetadata?.intakeYear ?? null,
    year_level: yearMetadata?.yearLevel ?? null,
  };
}