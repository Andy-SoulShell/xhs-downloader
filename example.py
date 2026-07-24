"""Python 客户端调用示例。"""

import asyncio
import os

from xhs_sdk import XHS


async def main() -> None:
    """读取用户提供的链接并演示详情解析与下载。"""
    url = os.environ.get("XHS_EXAMPLE_URL")
    if not url:
        print("请先设置 XHS_EXAMPLE_URL，再运行此示例。")
        return

    async with XHS() as client:
        detail = await client.detail(url)
        print(detail)

        outcome = await client.download(url)
        print(outcome)


if __name__ == "__main__":
    asyncio.run(main())
