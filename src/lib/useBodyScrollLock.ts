'use client';

import { useEffect } from 'react';

let lockCount = 0;
let lockedScrollY = 0;
let previousStyles: Record<string, string> | null = null;

function lockBody() {
  lockCount += 1;
  if (lockCount > 1) return;

  const body = document.body;
  const root = document.documentElement;
  lockedScrollY = window.scrollY;
  previousStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
    rootOverflow: root.style.overflow,
  };

  const scrollbarGap = Math.max(0, window.innerWidth - root.clientWidth);
  const currentPadding = Number.parseFloat(window.getComputedStyle(body).paddingRight) || 0;
  body.style.position = 'fixed';
  body.style.top = `-${lockedScrollY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  body.style.overflow = 'hidden';
  if (scrollbarGap) body.style.paddingRight = `${currentPadding + scrollbarGap}px`;
  root.style.overflow = 'hidden';
}

function unlockBody() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0 || !previousStyles) return;

  const body = document.body;
  const root = document.documentElement;
  const saved = previousStyles;
  previousStyles = null;
  body.style.position = saved.position;
  body.style.top = saved.top;
  body.style.left = saved.left;
  body.style.right = saved.right;
  body.style.width = saved.width;
  body.style.overflow = saved.overflow;
  body.style.paddingRight = saved.paddingRight;
  root.style.overflow = saved.rootOverflow;
  window.scrollTo(0, lockedScrollY);
}

export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    lockBody();
    return unlockBody;
  }, [active]);
}
