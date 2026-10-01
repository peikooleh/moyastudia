"use client";

import { RadialBar, RadialBarChart } from "recharts";
import { t } from "../lib/i18n";
import { usePrefs } from "./providers";

export function QuotaRings({ editsCap, editsUsed, uploadsCap, uploadsUsed }) {
  const { uiLang } = usePrefs();
  const editsLeft = Math.max(0, editsCap - editsUsed);
  const upLeft = Math.max(0, uploadsCap - uploadsUsed);
  const ePct = editsCap ? Math.round((editsLeft / editsCap) * 100) : 0;
  const uPct = uploadsCap ? Math.round((upLeft / uploadsCap) * 100) : 0;
  const data = [
    { name: "uploads", value: uPct, fill: "var(--info)" },
    { name: "edits", value: ePct, fill: "var(--accent)" },
  ];
  return (
    <div
      className="quota"
      title={`${t(uiLang, "quotaEdits", { left: editsLeft, cap: editsCap })}, ${t(uiLang, "quotaUploads", { left: upLeft, cap: uploadsCap })}`}
    >
      <div className="quota-title">{t(uiLang, "quotaTitle")}</div>
      <div className="quota-row">
        <RadialBarChart
          width={120}
          height={120}
          cx={60}
          cy={60}
          innerRadius={28}
          outerRadius={54}
          barSize={10}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar
            background
            clockWise
            dataKey="value"
            cornerRadius={8}
            isAnimationActive
            animationDuration={800}
          />
        </RadialBarChart>
        <ul>
          <li>
            <i className="dot edit" />
            {t(uiLang, "quotaEdits", { left: editsLeft, cap: editsCap })}
          </li>
          <li>
            <i className="dot upload" />
            {t(uiLang, "quotaUploads", { left: upLeft, cap: uploadsCap })}
          </li>
        </ul>
      </div>
    </div>
  );
}
