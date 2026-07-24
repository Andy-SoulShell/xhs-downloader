import type { WorkspaceView } from "../lib/workspace";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "./segmented-control";
import { workspaceViewItems } from "./workspace-navigation";

export function MobileWorkspaceNav({
  view,
  onViewChange,
}: {
  view: WorkspaceView;
  onViewChange: (view: WorkspaceView) => void;
}) {
  return (
    <nav
      aria-label="工作台视图"
      className="border-b border-stone-200/80 bg-[#f4f1eb]/90 px-5 pb-4 backdrop-blur sm:px-8 lg:hidden"
    >
      <SegmentedControl
        ariaLabel="切换工作台视图"
        className="grid grid-cols-5"
        onValueChange={(value) => onViewChange(value as WorkspaceView)}
        value={view}
      >
        {workspaceViewItems.map((item) => (
          <SegmentedControlItem
            icon={item.icon}
            key={item.view}
            value={item.view}
            variant="navigation"
          >
            {item.label}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
    </nav>
  );
}
