import { PrismaClient } from '@prisma/client';

// 内部保存: Prisma (SQLite) クライアントを共有
export const prisma = new PrismaClient();
