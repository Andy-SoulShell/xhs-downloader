import type {
  ProfileMetric,
  UserProfileResult,
} from "@xhs-downloader/contracts";

import { parseFeedSummaries } from "./feed-parser";
import {
  dataList,
  dataRecord,
  dataText,
  dataUrl,
  latestInitialState,
  unwrapState,
} from "./page-data";

/** 从用户主页解析账号资料、统计项和帖子摘要。 */
export function parseUserProfileDocument(
  page: Document,
  requestedUserId: string | null,
  currentState?: Record<string, unknown>,
): UserProfileResult {
  const state = currentState ?? latestInitialState(page);
  const userState = dataRecord(state.user);
  const pageData = dataRecord(unwrapState(userState.userPageData));
  const basic = dataRecord(pageData.basicInfo);
  if (!Object.keys(basic).length) throw new Error("用户主页资料尚未加载");
  const feeds = parseFeedSummaries(unwrapState(userState.notes));
  return {
    user_id:
      dataText(basic.userId ?? basic.user_id) || requestedUserId || null,
    nickname: dataText(basic.nickname),
    red_id: dataText(basic.redId),
    description: dataText(basic.desc),
    avatar_url: dataUrl(basic.imageb ?? basic.images),
    ip_location: dataText(basic.ipLocation),
    metrics: dataList(pageData.interactions)
      .map(parseMetric)
      .filter((item): item is ProfileMetric => item !== null),
    feeds,
  };
}

function parseMetric(value: unknown): ProfileMetric | null {
  const metric = dataRecord(value);
  const name = dataText(metric.name);
  if (!name) return null;
  return {
    name,
    count: dataText(metric.count) || "0",
    metric_type: dataText(metric.type),
  };
}
