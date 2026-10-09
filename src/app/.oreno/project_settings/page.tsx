import { connection } from "next/server";
import { getRootDirName } from "@/lib/docPath";
import { loadProjectSettings } from "@/lib/projectSettings";
import {
  loadSidebarSettings,
  loadStarredPages,
  loadViewHistories,
} from "@/lib/userSettings";
import ProjectSettingsPage from "./ProjectSettingsPage";

// "/.oreno/project_settings" は静的なセグメントなので、
// 同じ階層にある [[...rest]]（catch-all）より優先してこのページが使われる
export default async function ProjectSettingsRoute() {
  // 設定ファイルはリクエストごとに最新の内容を読み直したいので、
  // [...slug]/page.tsx と同様に connection() を呼んでおく
  await connection();

  const settings = await loadProjectSettings();

  const sidebarSettings = await loadSidebarSettings();
  const starredPages = await loadStarredPages();
  const histories = await loadViewHistories();

  return (
    <ProjectSettingsPage
      rootDirName={getRootDirName()}
      initialProjectName={settings.projectName}
      sidebarSettings={sidebarSettings}
      starredPages={starredPages}
      histories={histories}
    />
  );
}
