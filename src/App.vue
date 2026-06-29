<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  buildWeekSchedule,
  clearManualAssignment,
  normalizeState,
  replaceAssignment,
} from "./lib/schedule.js";
import {
  formatDisplayDate,
  formatIsoDate,
  getMonthLabel,
  getWeekDays,
  getWeekLabel,
  getWeekdayLabel,
  isSameDate,
  isSameWeek,
} from "./lib/date.js";

const STORAGE_KEY = "cleaning-calendar-state";
const THEME_KEY = "cleaning-calendar-theme";
const DEFAULT_DATA_URL = `/cleaning_calendar//data/company.json`;

const state = reactive({
  data: null,
  loading: true,
  error: "",
  weekCursor: new Date(),
  activeTab: "schedule",
  mode: "view",
  replacementDraft: {
    date: "",
    employeeId: "",
    reason: "",
  },
});

const showReplacementModal = ref(false);
const showPastDays = ref(false);
const theme = ref("dark");
const importFileInput = ref(null);

const employeeMap = computed(() => {
  const entries =
    state.data?.employees?.map((employee) => [employee.id, employee]) ?? [];
  return new Map(entries);
});

const activeEmployees = computed(
  () => state.data?.employees?.filter((employee) => employee.active) ?? [],
);
const currentWeekDays = computed(() =>
  getWeekDays(
    state.weekCursor,
    state.data?.company.workingDays ?? [1, 2, 3, 4, 5],
  ),
);
const todayDate = computed(() => new Date());
const isCurrentWeek = computed(() =>
  isSameWeek(state.weekCursor, todayDate.value),
);
const hiddenPastDaysCount = computed(() => {
  if (!isCurrentWeek.value) {
    return 0;
  }

  return currentWeekDays.value.filter(
    (date) => date < todayDate.value && !isSameDate(date, todayDate.value),
  ).length;
});
const visibleWeekDays = computed(() => {
  if (!isCurrentWeek.value || showPastDays.value) {
    return currentWeekDays.value;
  }

  return currentWeekDays.value.filter(
    (date) => date >= todayDate.value || isSameDate(date, todayDate.value),
  );
});
const visibleWeekDayKeys = computed(
  () => new Set(visibleWeekDays.value.map((date) => formatIsoDate(date))),
);
const weekAssignments = computed(() => {
  if (!state.data) {
    return [];
  }

  return buildWeekSchedule(state.data, state.weekCursor);
});
const weekLabel = computed(() => getWeekLabel(state.weekCursor));
const monthLabel = computed(() => getMonthLabel(state.weekCursor));
const replacementHistory = computed(
  () => state.data?.schedule?.replacementHistory ?? [],
);
const scheduleRows = computed(() => {
  const assignmentsByDate = new Map(
    weekAssignments.value.map((item) => [item.date, item]),
  );

  return activeEmployees.value.map((employee) => ({
    employee,
    cells: currentWeekDays.value
      .filter((date) => visibleWeekDayKeys.value.has(formatIsoDate(date)))
      .map((date) => {
        const isoDate = formatIsoDate(date);
        const assignment = assignmentsByDate.get(isoDate);
        const isAssigned = assignment?.employeeId === employee.id;

        return {
          date,
          isoDate,
          assignment: isAssigned ? assignment : null,
        };
      }),
  }));
});

const tabs = computed(() => {
  const result = [
    { value: "schedule", label: "Расписание" },
    { value: "duties", label: "Обязанности" },
  ];

  if (state.mode === "edit") {
    result.splice(1, 0, { value: "settings", label: "Настройки" });
  }

  return result;
});

const rotationDirectionItems = computed(() => [
  { value: "forward", label: "По кругу вперед" },
  { value: "reverse", label: "По кругу назад" },
]);

const employeeItems = computed(() => {
  return activeEmployees.value.map((emp) => ({
    value: emp.id,
    label: emp.name,
  }));
});

function createEmployeeId(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "") || `employee-${Date.now()}`
  );
}

function persistState() {
  if (state.data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  }
}

function applyTheme(nextTheme) {
  theme.value = nextTheme;
  if (nextTheme === "light") {
    document.documentElement.classList.add("light");
    document.documentElement.classList.remove("dark");
  } else {
    document.documentElement.classList.add("dark");
    document.documentElement.classList.remove("light");
  }
  localStorage.setItem(THEME_KEY, nextTheme);
}

function setData(nextData) {
  state.data = normalizeState(nextData);
  persistState();
}

async function loadDefaultState() {
  const response = await fetch(DEFAULT_DATA_URL);

  if (!response.ok) {
    throw new Error(`Не удалось загрузить стартовый JSON: ${response.status}`);
  }

  return normalizeState(await response.json());
}

async function initialize() {
  state.loading = true;
  state.error = "";

  try {
    const localTheme = localStorage.getItem(THEME_KEY);
    // Сначала принудительно установим тему, чтобы классы были применены
    if (localTheme === "light") {
      document.documentElement.classList.add("light");
      document.documentElement.classList.remove("dark");
    } else {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    }
    theme.value = localTheme === "light" ? "light" : "dark";

    const localState = localStorage.getItem(STORAGE_KEY);
    if (localState) {
      state.data = normalizeState(JSON.parse(localState));
    } else {
      state.data = await loadDefaultState();
      persistState();
    }
  } catch (error) {
    state.error =
      error instanceof Error
        ? error.message
        : "Не удалось инициализировать приложение";
  } finally {
    state.loading = false;
  }
}

function moveWeek(step) {
  const nextDate = new Date(state.weekCursor);
  nextDate.setDate(nextDate.getDate() + step * 7);
  state.weekCursor = nextDate;
  showPastDays.value = false;
}

function addEmployee() {
  if (!state.data) {
    return;
  }

  const name = `Новый сотрудник ${state.data.employees.length + 1}`;
  const id = createEmployeeId(`${name}-${Date.now()}`);

  state.data.employees.push({
    id,
    name,
    active: true,
  });
  state.data.schedule.rotationOrder.push(id);
  persistState();
}

function removeEmployee(employeeId) {
  if (!state.data) {
    return;
  }

  state.data.employees = state.data.employees.filter(
    (employee) => employee.id !== employeeId,
  );
  state.data.schedule.rotationOrder = state.data.schedule.rotationOrder.filter(
    (id) => id !== employeeId,
  );

  Object.keys(state.data.schedule.manualAssignments).forEach((date) => {
    if (state.data.schedule.manualAssignments[date].employeeId === employeeId) {
      delete state.data.schedule.manualAssignments[date];
    }
  });

  persistState();
}

function addDuty() {
  if (!state.data) {
    return;
  }

  state.data.duties.push({
    id: `duty-${Date.now()}`,
    title: "Новая обязанность",
    description: "",
  });
  persistState();
}

function removeDuty(dutyId) {
  if (!state.data) {
    return;
  }

  state.data.duties = state.data.duties.filter((duty) => duty.id !== dutyId);
  persistState();
}

function openReplacementDialog(item) {
  state.replacementDraft = {
    date: item.date,
    employeeId: item.employeeId ?? activeEmployees.value[0]?.id ?? "",
    reason: item.reason ?? "",
  };
  showReplacementModal.value = true;
}

function saveReplacement() {
  if (
    !state.data ||
    !state.replacementDraft.date ||
    !state.replacementDraft.employeeId
  ) {
    return;
  }

  const currentAssignment = weekAssignments.value.find(
    (item) => item.date === state.replacementDraft.date,
  );
  state.data = replaceAssignment(state.data, {
    date: state.replacementDraft.date,
    employeeId: state.replacementDraft.employeeId,
    replacedEmployeeId: currentAssignment?.employeeId ?? null,
    reason: state.replacementDraft.reason,
  });
  showReplacementModal.value = false;
  persistState();
}

function resetReplacement(date) {
  if (!state.data) {
    return;
  }

  state.data = clearManualAssignment(state.data, date);
  persistState();
}

function triggerImport() {
  importFileInput.value?.click();
}

async function handleImport(event) {
  const [file] = event.target.files ?? [];

  if (!file) {
    return;
  }

  try {
    const parsed = JSON.parse(await file.text());
    setData(parsed);
  } catch (error) {
    state.error =
      error instanceof Error ? error.message : "Не удалось импортировать JSON";
  } finally {
    event.target.value = "";
  }
}

function exportJson() {
  if (!state.data) {
    return;
  }

  const blob = new Blob([JSON.stringify(state.data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "cleaning-calendar.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function resetToRepositoryState() {
  try {
    const defaultState = await loadDefaultState();
    setData(defaultState);
  } catch (error) {
    state.error =
      error instanceof Error
        ? error.message
        : "Не удалось перезагрузить стартовый JSON";
  }
}

watch(
  () => state.data,
  () => {
    persistState();
  },
  { deep: true },
);

watch(
  () => state.mode,
  (nextMode) => {
    if (nextMode === "view" && state.activeTab === "settings") {
      state.activeTab = "schedule";
    }
  },
);

onMounted(() => {
  initialize();
});
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <div>
        <p class="eyebrow">Универсальный календарь уборки</p>
        <h1>{{ state.data?.company.name || "Компания" }}</h1>
        <p class="hero-copy">
          Недельное дежурство по будням, режим просмотра для команды и режим
          редактирования для администратора.
        </p>
      </div>

      <div class="hero-panel">
        <div class="hero-stat">
          <span>Режим</span>
          <B24FieldGroup>
            <B24Button
              :active="state.mode === 'view'"
              @click="state.mode = 'view'"
            >
              Просмотр
            </B24Button>
            <B24Button
              :active="state.mode === 'edit'"
              @click="state.mode = 'edit'"
            >
              Редактирование
            </B24Button>
          </B24FieldGroup>
        </div>

        <div class="hero-stat">
          <span>Тема</span>
          <B24FieldGroup>
            <B24Button :active="theme === 'light'" @click="applyTheme('light')">
              Светлая
            </B24Button>
            <B24Button :active="theme === 'dark'" @click="applyTheme('dark')">
              Темная
            </B24Button>
          </B24FieldGroup>
        </div>

        <div class="hero-stat">
          <span>Активных сотрудников</span>
          <strong>{{ activeEmployees.length }}</strong>
        </div>
      </div>
    </section>

    <B24Alert v-if="state.error" type="error">
      {{ state.error }}
    </B24Alert>

    <section v-if="state.loading" class="loading-state">
      Загрузка данных...
    </section>

    <template v-else-if="state.data">
      <B24Tabs :items="tabs" v-model="state.activeTab" />

      <template v-if="state.activeTab === 'schedule'">
        <div class="layout-grid layout-grid--schedule">
          <div class="panel panel-wide">
            <div class="card-heading">
              <div>
                <p class="card-label">Расписание</p>
                <h2>{{ weekLabel }}</h2>
                <p class="support-text">{{ monthLabel }}</p>
              </div>
              <div class="month-actions">
                <B24Button @click="moveWeek(-1)">←</B24Button>
                <B24Button @click="moveWeek(1)">→</B24Button>
              </div>
            </div>

            <div
              class="toolbar-actions"
              v-if="isCurrentWeek && hiddenPastDaysCount"
            >
              <B24Button
                color="air-tertiary"
                @click="showPastDays = !showPastDays"
              >
                {{
                  showPastDays
                    ? "Спрятать прошедшие дежурства"
                    : `Показать прошедшие дежурства (${hiddenPastDaysCount})`
                }}
              </B24Button>
            </div>

            <div class="schedule-table-wrap">
              <table class="schedule-table">
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    <th
                      v-for="date in visibleWeekDays"
                      :key="formatIsoDate(date)"
                    >
                      <div class="schedule-head">
                        <span>{{ getWeekdayLabel(date) }}</span>
                        <strong>{{ formatDisplayDate(date) }}</strong>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in scheduleRows" :key="row.employee.id">
                    <td class="employee-cell">{{ row.employee.name }}</td>
                    <td
                      v-for="cell in row.cells"
                      :key="cell.isoDate"
                      class="assignment-cell"
                    >
                      <div v-if="cell.assignment" class="assignment-card">
                        <B24Badge
                          :color="
                            cell.assignment.isManual
                              ? 'air-warning'
                              : 'air-primary'
                          "
                        >
                          {{ cell.assignment.isManual ? "Замена" : "Дежурный" }}
                        </B24Badge>
                        <template v-if="state.mode === 'edit'">
                          <B24Button
                            size="sm"
                            @click="openReplacementDialog(cell.assignment)"
                          >
                            Заменить
                          </B24Button>
                          <B24Button
                            v-if="cell.assignment.isManual"
                            color="air-tertiary"
                            size="sm"
                            @click="resetReplacement(cell.assignment.date)"
                          >
                            Сбросить
                          </B24Button>
                        </template>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel">
            <div class="card-heading">
              <div>
                <p class="card-label">История</p>
                <h2>Последние замены</h2>
              </div>
            </div>

            <div class="history-list">
              <article
                v-for="entry in replacementHistory"
                :key="entry.id"
                class="history-item"
              >
                <div>
                  <h3>{{ formatDisplayDate(new Date(entry.date)) }}</h3>
                  <p>
                    {{
                      employeeMap.get(entry.replacedEmployeeId)?.name ||
                      "Автораспределение"
                    }}
                    →
                    {{
                      employeeMap.get(entry.employeeId)?.name ||
                      "Неизвестный сотрудник"
                    }}
                  </p>
                </div>
                <p class="history-reason">
                  {{ entry.reason || "Без комментария" }}
                </p>
              </article>
              <p v-if="!replacementHistory.length" class="support-text">
                Пока замен не было.
              </p>
            </div>
          </div>
        </div>
      </template>

      <template
        v-else-if="state.activeTab === 'settings' && state.mode === 'edit'"
      >
        <div class="layout-grid">
          <div class="panel">
            <div class="card-heading">
              <div>
                <p class="card-label">Основные настройки</p>
                <h2>Компания и данные</h2>
              </div>
            </div>

            <div class="form-grid">
              <label class="field">
                <span>Название компании</span>
                <B24Input v-model="state.data.company.name" />
              </label>

              <label class="field">
                <span>Направление круга</span>
                <B24Select
                  v-model="state.data.schedule.rotationDirection"
                  :items="rotationDirectionItems"
                />
              </label>
            </div>

            <div class="stack-item-actions">
              <B24Button color="air-tertiary" @click="triggerImport"
                >Импорт JSON</B24Button
              >
              <B24Button color="air-tertiary" @click="exportJson"
                >Экспорт JSON</B24Button
              >
              <B24Button color="air-danger" @click="resetToRepositoryState">
                Сбросить к версии из Git
              </B24Button>
            </div>

            <input
              ref="importFileInput"
              type="file"
              accept="application/json"
              class="visually-hidden"
              @change="handleImport"
            />
          </div>

          <div class="panel">
            <div class="card-heading">
              <div>
                <p class="card-label">Ротация команды</p>
                <h2>Сотрудники</h2>
              </div>
              <B24Button @click="addEmployee">Добавить</B24Button>
            </div>

            <p class="support-text">
              Порядок круга сейчас такой:
              {{
                state.data.schedule.rotationOrder
                  .map((employeeId) => employeeMap.get(employeeId)?.name)
                  .filter(Boolean)
                  .join(" → ")
              }}
            </p>

            <div class="stack-list">
              <article
                v-for="employee in state.data.employees"
                :key="employee.id"
                class="stack-item"
              >
                <label class="field">
                  <span>Имя</span>
                  <B24Input v-model="employee.name" />
                </label>
                <div class="stack-item-actions">
                  <label class="toggle-row">
                    <B24Checkbox v-model="employee.active" />
                    <span>Участвует в ротации</span>
                  </label>
                </div>
                <B24Button
                  color="air-tertiary"
                  @click="removeEmployee(employee.id)"
                >
                  Удалить
                </B24Button>
              </article>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="state.activeTab === 'duties'">
        <div class="panel panel-wide">
          <div class="card-heading">
            <div>
              <p class="card-label">Обязанности</p>
              <h2>Что нужно сделать</h2>
            </div>
            <B24Button v-if="state.mode === 'edit'" @click="addDuty"
              >Добавить</B24Button
            >
          </div>

          <div class="duties-list">
            <article
              v-for="duty in state.data.duties"
              :key="duty.id"
              class="duty-card"
            >
              <template v-if="state.mode === 'edit'">
                <label class="field">
                  <span>Заголовок</span>
                  <B24Input v-model="duty.title" />
                </label>
                <label class="field">
                  <span>Описание</span>
                  <B24Textarea v-model="duty.description" rows="3" />
                </label>
                <div class="stack-item-actions">
                  <B24Button color="air-tertiary" @click="removeDuty(duty.id)"
                    >Удалить</B24Button
                  >
                </div>
              </template>
              <template v-else>
                <h3>{{ duty.title }}</h3>
                <p>{{ duty.description }}</p>
              </template>
            </article>
          </div>
        </div>
      </template>
    </template>

    <B24Modal v-model:open="showReplacementModal" title="Ручная замена">
      <template #body>
        <div class="modal-body">
          <p class="support-text">
            {{ formatDisplayDate(new Date(state.replacementDraft.date)) }}
          </p>

          <label class="field">
            <span>Новый дежурный</span>
            <B24Select
              v-model="state.replacementDraft.employeeId"
              :items="employeeItems"
            />
          </label>

          <label class="field">
            <span>Причина замены</span>
            <B24Textarea
              v-model="state.replacementDraft.reason"
              rows="3"
              placeholder="Например: отпуск, больничный, обмен сменами"
            />
          </label>
        </div>
      </template>

      <template #footer>
        <B24Button color="air-tertiary" @click="showReplacementModal = false"
          >Отмена</B24Button
        >
        <B24Button @click="saveReplacement">Сохранить замену</B24Button>
      </template>
    </B24Modal>
  </main>
</template>
