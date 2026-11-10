import { useEffect, useState } from "react";
import { getCandidates } from "@/app/actions";

// ファイル一覧の更新が終わっていないときに、取得し直すまでの待ち時間
const RETRY_MS = 1000;

// select を省略したときは、取得した一覧をそのまま使う
const selectAll = (files: string[]) => files;

/**
 * 候補に使うファイルの一覧をサーバーから取得するフック
 * 開いたときにサーバーへ一覧の更新を依頼するが、更新の完了は待たない
 * 更新中は、更新前の一覧をそのまま使う（最初のスキャンが終わっていないときは一覧がない）
 * 更新が終わるまで取得し直して、終わったら新しい一覧に差し替える
 *
 * select は、取得した一覧から候補にするものを選ぶ（絞り込みや変換）
 * 渡す関数が変わると取得し直すので、コンポーネントの外で定義した関数を渡すこと
 *
 * ready は、取得が終わったかどうか
 * 取得に失敗したときは、候補が空のまま ready になる
 */
export function useCandidateFiles(select: (files: string[]) => string[] = selectAll) {
  const [files, setFiles] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const load = async (refresh: boolean) => {
      try {
        const result = await getCandidates(refresh);
        if (cancelled) return;
        if (result.ready) {
          setFiles(select(result.files));
          setReady(true);
        }
        if (!result.ready || result.scanning) {
          timer = setTimeout(() => load(false), RETRY_MS);
        }
      } catch {
        // 取得に失敗したときは、候補が空のものとして扱う
        setReady(true);
      }
    };
    void load(true);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [select]);

  return { files, ready };
}
