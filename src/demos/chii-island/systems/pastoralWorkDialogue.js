function summarize(text, maxLength = 28) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

async function confirmTarget({ targetName, actionLabel, askChoice }) {
  const choice = await askChoice(
    `确认一下，是要${actionLabel}“${targetName}”吗？`,
    [
      { key: 'confirm_target', label: '是的，就是这个。' },
      { key: 'cancel', label: '不是，先取消。' },
    ],
  );
  return choice?.key === 'confirm_target';
}

export async function collectRefineWorkRequest({ targetName, askChoice, askInput }) {
  const targetConfirmed = await confirmTarget({
    targetName,
    actionLabel: '修改',
    askChoice,
  });
  if (!targetConfirmed) return null;

  const description = await askInput(
    '你想要怎么调整呢？',
    '例如：变成发光森林树',
  );
  if (!description?.trim()) return null;

  const finalChoice = await askChoice(
    `确认把“${targetName}”修改为“${summarize(description)}”吗？`,
    [
      { key: 'confirm_work', label: '确认修改，开始吧。' },
      { key: 'cancel', label: '先不修改。' },
    ],
  );
  if (finalChoice?.key !== 'confirm_work') return null;

  return { description: description.trim() };
}

export async function collectMountWorkRequest({ targetName, askChoice, askInput }) {
  const targetConfirmed = await confirmTarget({
    targetName,
    actionLabel: '装配',
    askChoice,
  });
  if (!targetConfirmed) return null;

  const part = await askInput(
    '你想要装配什么内容呢？',
    '例如：一盏小灯',
  );
  if (!part?.trim()) return null;

  const placement = await askInput(
    '这个要装配在哪里呢？',
    '例如：头部 / 屋顶 / 墙上',
  );
  if (!placement?.trim()) return null;

  const finalChoice = await askChoice(
    `确认把“${summarize(part)}”装配到“${targetName}”的“${summarize(placement)}”吗？`,
    [
      { key: 'confirm_work', label: '确认装配，开始吧。' },
      { key: 'cancel', label: '先不装配。' },
    ],
  );
  if (finalChoice?.key !== 'confirm_work') return null;

  return {
    part: part.trim(),
    placement: placement.trim(),
  };
}
