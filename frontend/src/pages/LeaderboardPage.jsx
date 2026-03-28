import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { usersApi } from "../api/usersApi.js";
import { AvatarBadge } from "../components/ui/AvatarBadge.jsx";
import { MetricChip } from "../components/ui/MetricChip.jsx";
import { HeartIcon } from "../components/ui/SocialGlyphs.jsx";

const PERIODS = ["day", "week", "month"];

export function LeaderboardPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState("week");
  const [leaders, setLeaders] = useState([]);

  useEffect(() => {
    usersApi.leaderboard(period).then(result => setLeaders(result.leaders)).catch(() => undefined);
  }, [period]);

  return (
    <div className="workspace-page">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Top progression</p>
          <h1>Leaderboard</h1>
          <p>See who earned the most XP today, this week, or this month.</p>
        </div>
        <div className="inline-actions wrap-actions">
          {PERIODS.map(item => (
            <button
              key={item}
              type="button"
              className={`ghost-button ${period === item ? "is-selected" : ""}`}
              onClick={() => setPeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <div className="stack">
          {leaders.map(entry => (
            <button
              key={entry.user.id}
              type="button"
              className="catalog-card leaderboard-row leaderboard-row--button"
              onClick={() => navigate(`/users/${entry.user.id}`)}
            >
              <div className="leaderboard-row__identity">
                <span className="leaderboard-rank">#{entry.rank}</span>
                <AvatarBadge user={entry.user} />
                <div>
                  <strong>{entry.user.displayName}</strong>
                  <p>@{entry.user.username}</p>
                </div>
              </div>
              <div className="leaderboard-row__stats">
                <span className="stat-chip">{entry.xpGained} XP</span>
                <span className="stat-chip">Lv {entry.user.level}</span>
                <MetricChip
                  icon={<HeartIcon filled />}
                  value={entry.user.heartsReceived}
                  label="Likes received"
                  tone="heart"
                />
              </div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
