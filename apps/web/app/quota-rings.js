"use client";

import { RadialBar, RadialBarChart } from "recharts";

export function QuotaRings({ editsCap, editsUsed, uploadsCap, uploadsUsed }) {
  const editsLeft = Math.max(0, editsCap - editsUsed);
  const upLeft = Math.max(0, uploadsCap - uploadsUsed);
  const ePct = editsCap ? Math.round((editsLeft / editsCap) * 100) : 0;
  const uPct = uploadsCap ? Math.round((upLeft / uploadsCap) * 100) : 0;
  const data = [
    { name: "uploads", value: uPct, fill: "#3b6fd6" },
    { name: "edits", value: ePct, fill: "#ff0000" },
  ];
  return (
    <div className="quota" title={`правки ${editsLeft}/${editsCap}, загрузки ${upLeft}/${uploadsCap}`}>
      <div className="quota-title">Квота дня</div>
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
            <i className="dot red" />
            правки {editsLeft}/{editsCap}
          </li>
          <li>
            <i className="dot blue" />
            загрузки {upLeft}/{uploadsCap}
          </li>
        </ul>
      </div>
    </div>
  );
}
