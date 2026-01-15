
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/leaderboard", async (_req, res) => {
  try {
    const period = "monthly";

    const result = await db.execute(sql`
      SELECT c.id, c.name, c.slug, c.affiliate_link
      FROM leaderboard_entries le
      JOIN leaderboards l ON l.id = le.leaderboard_id
      JOIN casinos c ON c.id = l.casino_id
      WHERE l.period_type = ${period}
        AND l.is_active = true
      GROUP BY c.id
      -- leaderboard_entries stores the numeric ranking metric in value.
      -- Older code referenced a non-existent wagered column, which breaks on fresh DBs.
      ORDER BY SUM(le.value) DESC
      LIMIT 1
    `);

    if (!result.rows.length) return res.json(null);

    res.json({
      period,
      casino: result.rows[0]
    });
  } catch (err) {
    console.error('[homeLeaderboard] failed', err);
    return res.status(500).json({ error: 'leaderboard_failed' });
  }

});

export default router;
