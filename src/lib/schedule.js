import { eachDay, formatIsoDate, getWeekDays, isSameWeek } from './date.js'

const LEGACY_ROTATION_ORDER = [
  'vadim',
  'danil',
  'kristina',
  'nikita',
  'aleksey',
  'mikhail',
  'ilya'
]

const DEFAULT_ROTATION_ORDER = [
  'vadim',
  'danil',
  'kristina',
  'nikita',
  'ilya',
  'aleksey',
  'mikhail'
]

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function isSameOrder(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function createDefaultScheduleData(employeeIds) {
  return {
    rotationOrder: [...employeeIds],
    rotationDirection: 'forward',
    manualAssignments: {},
    replacementHistory: []
  }
}

export function buildWeekSchedule(state, weekDate) {
  const workingDays = new Set(state.company.workingDays)
  const activeEmployees = state.employees.filter((employee) => employee.active)
  const activeEmployeeIds = activeEmployees.map((employee) => employee.id)
  const rotation = state.schedule.rotationOrder.filter((employeeId) => activeEmployeeIds.includes(employeeId))
  const missingFromRotation = activeEmployeeIds.filter((employeeId) => !rotation.includes(employeeId))
  const rotationOrder = [...rotation, ...missingFromRotation]
  const orderedRotation = state.schedule.rotationDirection === 'reverse'
    ? [...rotationOrder].reverse()
    : rotationOrder
  const weekDays = getWeekDays(weekDate, state.company.workingDays)
  const yearStart = new Date(weekDate.getFullYear(), 0, 1)
  const timeline = eachDay(yearStart, weekDays.at(-1)).filter((date) => workingDays.has(date.getDay()))
  const assignments = []

  timeline.forEach((date, index) => {
    const isoDate = formatIsoDate(date)
    const manualAssignment = state.schedule.manualAssignments[isoDate]
    const plannedEmployeeId = orderedRotation.length ? orderedRotation[index % orderedRotation.length] : null

    if (manualAssignment?.employeeId && activeEmployeeIds.includes(manualAssignment.employeeId)) {
      assignments.push({
        date: isoDate,
        employeeId: manualAssignment.employeeId,
        isManual: true,
        replacedEmployeeId: manualAssignment.replacedEmployeeId ?? plannedEmployeeId,
        reason: manualAssignment.reason ?? ''
      })
      return
    }

    if (!orderedRotation.length) {
      assignments.push({
        date: isoDate,
        employeeId: null,
        isManual: false,
        replacedEmployeeId: null,
        reason: ''
      })
      return
    }

    assignments.push({
      date: isoDate,
      employeeId: plannedEmployeeId,
      isManual: false,
      replacedEmployeeId: null,
      reason: ''
    })
  })

  return assignments.filter((assignment) => isSameWeek(new Date(assignment.date), weekDate))
}

export function replaceAssignment(state, payload) {
  const nextState = cloneJson(state)
  nextState.schedule.manualAssignments[payload.date] = {
    employeeId: payload.employeeId,
    replacedEmployeeId: payload.replacedEmployeeId ?? null,
    reason: payload.reason ?? '',
    updatedAt: new Date().toISOString()
  }
  nextState.schedule.replacementHistory.unshift({
    id: crypto.randomUUID(),
    date: payload.date,
    employeeId: payload.employeeId,
    replacedEmployeeId: payload.replacedEmployeeId ?? null,
    reason: payload.reason ?? '',
    updatedAt: new Date().toISOString()
  })
  return nextState
}

export function clearManualAssignment(state, date) {
  const nextState = cloneJson(state)
  delete nextState.schedule.manualAssignments[date]
  return nextState
}

export function normalizeState(rawState) {
  const nextState = cloneJson(rawState)
  const employeeIds = nextState.employees.map((employee) => employee.id)

  if (!nextState.schedule) {
    nextState.schedule = createDefaultScheduleData(employeeIds)
  }

  if (!Array.isArray(nextState.schedule.rotationOrder)) {
    nextState.schedule.rotationOrder = [...employeeIds]
  }

  if (!nextState.schedule.manualAssignments) {
    nextState.schedule.manualAssignments = {}
  }

  if (!Array.isArray(nextState.schedule.replacementHistory)) {
    nextState.schedule.replacementHistory = []
  }

  if (nextState.schedule.rotationDirection !== 'reverse') {
    nextState.schedule.rotationDirection = 'forward'
  }

  nextState.schedule.rotationOrder = [
    ...nextState.schedule.rotationOrder.filter((employeeId) => employeeIds.includes(employeeId)),
    ...employeeIds.filter((employeeId) => !nextState.schedule.rotationOrder.includes(employeeId))
  ]

  if (isSameOrder(nextState.schedule.rotationOrder, LEGACY_ROTATION_ORDER)) {
    nextState.schedule.rotationOrder = DEFAULT_ROTATION_ORDER.filter((employeeId) => employeeIds.includes(employeeId))
  }

  return nextState
}
