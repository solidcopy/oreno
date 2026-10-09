import { connection } from "next/server";
import { getRootDirName } from "@/lib/docPath";
import { loadProjectSettings } from "@/lib/projectSettings";
import {
  loadOrderSetting,
  loadSidebarSettings,
  loadStarredPages,
  loadViewHistories,
} from "@/lib/userSettings";
import UserSettingsPage from "./UserSettingsPage";

// "/.oreno/user_settings" は静的なセグメントなので、
// 同じ階層にある [[...rest]]（catch-all）より優先してこのページが使われる
export default async function UserSettingsRoute() {
  // 設定ファイルはリクエストごとに最新の内容を読み直したいので connection() を呼んでおく
  await connection();

  const { projectName } = await loadProjectSettings();
  const order = await loadOrderSetting();

  const sidebarSettings = await loadSidebarSettings();
  const starredPages = await loadStarredPages();
  const histories = await loadViewHistories();

  return (
    <UserSettingsPage
      rootDirName={getRootDirName()}
      projectName={projectName}
      initialOrder={order}
      sidebarSettings={sidebarSettings}
      starredPages={starredPages}
      histories={histories}
    />
  );
}
