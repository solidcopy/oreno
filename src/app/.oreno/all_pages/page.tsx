import { connection } from "next/server";
import { getRootDirName } from "@/lib/docPath";
import { listAllPages } from "@/lib/folder";
import { loadProjectSettings } from "@/lib/projectSettings";
import {
  loadSidebarSettings,
  loadStarredPages,
  loadViewHistories,
} from "@/lib/userSettings";
import AllPagesPage from "./AllPagesPage";

// "/.oreno/all_pages" は静的なセグメントなので、
// 同じ階層にある [[...rest]]（catch-all）より優先してこのページが使われる
export default async function AllPagesRoute() {
  // ページやフォルダは実行中に増減するので、リクエストごとに読み直す
  await connection();

  const { projectName } = await loadProjectSettings();
  // 並び順は既定（名前の昇順）
  const tree = await listAllPages();

  const sidebarSettings = await loadSidebarSettings();
  const starredPages = await loadStarredPages();
  const histories = await loadViewHistories();

  return (
    <AllPagesPage
      rootDirName={getRootDirName()}
      projectName={projectName}
      tree={tree}
      sidebarSettings={sidebarSettings}
      starredPages={starredPages}
      histories={histories}
    />
  );
}
