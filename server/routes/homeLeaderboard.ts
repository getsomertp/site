
import { Router } from "express";
import { db } from "../db";
import { sql } from "drizzle-orm";

const router = Router();

router.get("/leaderboard", async (_req, res) => {
  const period = "monthly";

  const result = await db.execute(sql`
    SELECT c.id, c.name, c.slug, c.affiliate_link
    FROM leaderboard_entries le
    JOIN leaderboards l ON l.id = le.leaderboard_id
    JOIN casinos c ON c.id = l.casino_id
    WHERE l.period_type = ${period}
      AND l.active = true
    GROUP BY c.id
    ORDER BY SUM(le.wagered) DESC
    LIMIT 1
  `);

  if (!result.rows.length) return res.json(null);

  res.json({
    period,
    casino: result.rows[0]
  });
});

export default router;
