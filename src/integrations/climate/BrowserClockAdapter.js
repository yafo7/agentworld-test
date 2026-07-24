function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export class BrowserClockAdapter {
  constructor({ now = () => new Date(), timeZoneResolver = null } = {}) {
    this.now = now;
    this.timeZoneResolver = timeZoneResolver || (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
      } catch {
        return 'local';
      }
    });
  }

  read() {
    const date = this.now();
    const hour = date.getHours();
    const minute = date.getMinutes();
    return {
      hour: hour + minute / 60 + date.getSeconds() / 3600,
      minute,
      month: date.getMonth() + 1,
      date: localDateKey(date),
      weekday: new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(date),
      timezone: this.timeZoneResolver(),
    };
  }
}
