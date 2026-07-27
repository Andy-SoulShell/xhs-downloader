/**
 * 骨架占位块。
 *
 * 形状要与将要出现的真实内容同构，否则数据到达时仍会跳变，反而比
 * 一行"正在加载"更糟。宽度用百分比模拟长短不一的真实文本。
 */
export function SkeletonLine({
  className = "",
  width = "100%",
}: {
  className?: string;
  width?: string;
}) {
  return (
    <span
      aria-hidden
      className={`block h-3 rounded-md bg-stone-950/[0.06] ${className}`}
      style={{ width }}
    />
  );
}

/** 与记录卡片同构的骨架：图标、标题行、说明行、元信息行。 */
export function SkeletonRecordCard() {
  return (
    <div aria-hidden className="record-card flex items-start gap-3.5">
      <span className="size-9 shrink-0 rounded-xl bg-stone-950/[0.06]" />
      <div className="min-w-0 flex-1 space-y-2.5 py-0.5">
        <SkeletonLine width="38%" />
        <SkeletonLine className="h-2.5" width="62%" />
        <SkeletonLine className="h-2.5" width="26%" />
      </div>
    </div>
  );
}

/**
 * 与帖子卡片同构的骨架：封面、两行标题、作者与数量行。
 *
 * 解析要等好几秒，而用户点完“添加到列表”后视线就落在列表上；
 * 这里先占一个位置，让人看得见“有一条正在路上”。
 */
export function SkeletonFeedCard() {
  return (
    <article className="feed-card" role="status" aria-label="正在解析">
      <span className="block aspect-3/4 w-full rounded-2xl bg-stone-950/[0.06]" />
      <div className="space-y-2.5 px-1 pt-3">
        <SkeletonLine width="88%" />
        <SkeletonLine width="54%" />
        <div className="flex items-center justify-between gap-3 pt-1">
          <SkeletonLine className="h-2.5" width="40%" />
          <SkeletonLine className="h-2.5" width="26%" />
        </div>
      </div>
    </article>
  );
}

/**
 * 一组记录骨架。
 *
 * @param count 占位条数；接近首屏可见条数即可，过多会造成加载很慢的错觉。
 */
export function SkeletonRecordList({ count = 3 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载"
      className="space-y-3 motion-safe:animate-pulse"
      role="status"
    >
      {Array.from({ length: count }, (_, index) => (
        <SkeletonRecordCard key={index} />
      ))}
    </div>
  );
}

/** 与表单字段同构的骨架：标签行加输入框。 */
export function SkeletonField({ wide = false }: { wide?: boolean }) {
  return (
    <div aria-hidden className={`space-y-2 ${wide ? "sm:col-span-2" : ""}`}>
      <SkeletonLine className="h-2.5" width="28%" />
      <span className="block h-11 rounded-xl bg-stone-950/[0.05]" />
    </div>
  );
}

/** 一组表单骨架。 */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="正在加载"
      className="grid gap-4 motion-safe:animate-pulse sm:grid-cols-2"
      role="status"
    >
      {Array.from({ length: fields }, (_, index) => (
        <SkeletonField key={index} />
      ))}
    </div>
  );
}
