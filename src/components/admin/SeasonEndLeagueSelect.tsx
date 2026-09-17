"use client";

type League = "premier" | "academy";

export default function SeasonEndLeagueSelect({ league }: { league: League }) {
  return (
    <form action="/admin/seasons-end" method="get" className="w-fit">
      <label htmlFor="season-end-league" className="flex flex-col gap-1 text-sm">
        League
        <select
          id="season-end-league"
          name="league"
          defaultValue={league}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="rounded border border-line bg-panel p-2"
        >
          <option value="premier">Premier · S5</option>
          <option value="academy">Academy · A1</option>
        </select>
      </label>
    </form>
  );
}
