import { pgTable, serial, timestamp, text, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

/**
 * 通用 KV 存储表：把后台所有动态 JSON（配置、素材、用户、统计）持久化到数据库，
 * 保证 FaaS 重启后数据不丢失（原本写入磁盘 /opt/bytefaas 或 os.tmpdir，重启即清空）。
 * value 以 JSONB 保存整个文档对象。
 */
export const appStore = pgTable("app_store", {
	key: text("key").primaryKey(),
	value: jsonb("value").notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});