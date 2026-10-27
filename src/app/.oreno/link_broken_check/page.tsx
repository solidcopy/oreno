import { connection } from "next/server";
import { getRootDirName } from "@/lib/docPath";
import { loadProjectSettings } from "@/lib/projectSettings";
import {
  loadSidebarSettings,
  loadStarredPages,
  loadViewHistories,
} from "@/lib/userSettings";
import LinkBrokenCheckPage from "./LinkBrokenCheckPage";

// "/.oreno/link_broken_check" は静的なセグメントなので、
// 同じ階層にある [[...rest]]（catch-all）より優先してこのページが使われる
// チェック自体はここでは行わず、画面が開いてから ./check の Route Handler に頼む
export default async function LinkBrokenCheckRoute() {
  await connection();

  const { projectName } = await loadProjectSettings();

  const sidebarSettings = await loadSidebarSettings();
  const starredPages = await loadStarredPages();
  const histories = await loadViewHistories();

  return (
    <LinkBrokenCheckPage
      rootDirName={getRootDirName()}
      projectName={projectName}
      sidebarSettings={sidebarSettings}
      starredPages={starredPages}
      histories={histories}
    />
  );
}
