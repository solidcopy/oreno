import { connection } from "next/server";
import { getRootDirName } from "@/lib/docPath";
import { loadProjectSettings } from "@/lib/projectSettings";
import { loadSidebarData } from "@/lib/userSettings";
import OrphanedPagesCheckPage from "./OrphanedPagesCheckPage";

// "/.oreno/orphaned_pages_check" は静的なセグメントなので、
// 同じ階層にある [[...rest]]（catch-all）より優先してこのページが使われる
// チェック自体はここでは行わず、画面が開いてから ./check の Route Handler に頼む
export default async function OrphanedPagesCheckRoute() {
  await connection();

  const { projectName } = await loadProjectSettings();

  const sidebar = await loadSidebarData();

  return (
    <OrphanedPagesCheckPage
      rootDirName={getRootDirName()}
      projectName={projectName}
      sidebar={sidebar}
    />
  );
}
