"use client";

import type { ReactNode } from "react";
import { Button, Tooltip } from "antd";
import type { ButtonProps, TooltipProps } from "antd";

interface IconOnlyButtonProps extends Omit<ButtonProps, "children"> {
  tooltip: ReactNode;
  tooltipPlacement?: TooltipProps["placement"];
}

export function IconOnlyButton({
  tooltip,
  tooltipPlacement = "top",
  shape = "circle",
  ...buttonProps
}: IconOnlyButtonProps) {
  return (
    <Tooltip title={tooltip} placement={tooltipPlacement}>
      <Button {...buttonProps} shape={shape} aria-label={typeof tooltip === "string" ? tooltip : undefined} />
    </Tooltip>
  );
}
