/**
 * Screen-bottom DOM overlay that shows "xxx 按E交互" hints
 * for all nearby interactable entities.
 */
export function createInteractionHint() {
  const container = document.createElement('div');
  container.id = 'interaction-hints';
  container.style.cssText = `
    position: fixed;
    bottom: 40px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
    z-index: 100;
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif;
  `;
  document.body.appendChild(container);

  return {
    update(nearbyList) {
      container.innerHTML = '';
      for (const entry of nearbyList) {
        const el = document.createElement('div');
        el.textContent = `${entry.name} ${entry.action}`;
        el.style.cssText = `
          background: rgba(0,0,0,0.6);
          color: #fff;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 16px;
          white-space: nowrap;
          backdrop-filter: blur(4px);
        `;
        container.appendChild(el);
      }
    },
    clear() {
      container.innerHTML = '';
    },
  };
}
