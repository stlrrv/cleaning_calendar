export function formatIsoDate(date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDisplayDate(date) {
  return new Intl.DateTimeFormat('ru-RU').format(date)
}

export function getWeekdayLabel(date, locale = 'ru-RU') {
  return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date)
}

export function getMonthLabel(date, locale = 'ru-RU') {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date)
}

export function startOfWeek(date) {
  const current = new Date(date)
  const day = current.getDay() || 7
  current.setHours(0, 0, 0, 0)
  current.setDate(current.getDate() - day + 1)
  return current
}

export function getWeekDays(date, workingDays = [1, 2, 3, 4, 5]) {
  const start = startOfWeek(date)
  return workingDays.map((dayOffset) => {
    const nextDate = new Date(start)
    nextDate.setDate(start.getDate() + dayOffset - 1)
    return nextDate
  })
}

export function getWeekLabel(date) {
  const days = getWeekDays(date)
  const firstDay = days[0]
  const lastDay = days.at(-1)
  return `${formatDisplayDate(firstDay)} - ${formatDisplayDate(lastDay)}`
}

export function eachDay(start, end) {
  const days = []
  const cursor = new Date(start)

  while (cursor <= end) {
    days.push(new Date(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

export function isSameDate(left, right) {
  return formatIsoDate(left) === formatIsoDate(right)
}

export function isSameWeek(left, right) {
  return formatIsoDate(startOfWeek(left)) === formatIsoDate(startOfWeek(right))
}
