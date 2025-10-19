import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
import { log } from './logger';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';

let _supabase: SupabaseClient | undefined;
if (supabaseUrl && supabaseKey) {
	// 簡易チェック: URL が http/https で始まるかを確認
	if (!/^https?:\/\//i.test(supabaseUrl)) {
		log(`supabase client not initialized: SUPABASE_URL does not look like a valid URL (${supabaseUrl})`);
	} else {
		try {
			_supabase = createClient(supabaseUrl, supabaseKey);
		} catch (err: any) {
			log('failed to create supabase client:', err?.message ?? err);
			_supabase = undefined;
		}
	}
} else {
	log('supabase client not initialized: SUPABASE_URL or SUPABASE_KEY not set');
}

export const supabase = _supabase;

// Prisma client を追加でエクスポート（ローカル/開発での利用）
export const prisma = new PrismaClient();
