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
const DEFAULT_DATA_URL = `${import.meta.env.BASE_URL}data/company.json`;

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

        return {
          date,
          isoDate,
          assignment:
            assignment?.employeeId === employee.id ? assignment : null,
        };
      }),
  }));
});

const tabs = computed(() => {
  const items = [
    { value: "schedule", label: "Расписание" },
    { value: "duties", label: "Обязанности" },
  ];

  if (state.mode === "edit") {
    items.splice(1, 0, { value: "settings", label: "Настройки" });
  }

  return items;
});

const rotationDirectionItems = computed(() => [
  { value: "forward", label: "По кругу вперед" },
  { value: "reverse", label: "По кругу назад" },
]);

const employeeItems = computed(() =>
  activeEmployees.value.map((employee) => ({
    value: employee.id,
    label: employee.name,
  })),
);

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
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(nextTheme);
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
    applyTheme(localTheme === "light" ? "light" : "dark");

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
  <main
    class="mx-auto min-h-screen max-w-[1440px] px-4 py-6 text-[var(--app-text)] md:px-6 lg:px-8"
  >
    <section class="mb-6 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_380px]">
      <div
        class="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 shadow-[var(--app-shadow)] backdrop-blur"
      >
        <p
          class="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]"
        >
          Универсальный календарь держурств
        </p>
        <h1 class="text-3xl font-semibold tracking-tight md:text-5xl">
          {{ state.data?.company.name || "Компания" }}
        </h1>
        <p
          class="mt-4 max-w-3xl text-sm leading-6 text-[var(--app-muted)] md:text-base"
        >
          Кто держурный?
        </p>
      </div>

      <div
        class="grid gap-3 rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-4 shadow-[var(--app-shadow)] backdrop-blur"
      >
        <div class="rounded-[22px] bg-[var(--app-surface-strong)] p-4">
          <div class="mb-3 text-sm text-[var(--app-muted)]">Режим</div>
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

        <div class="rounded-[22px] bg-[var(--app-surface-strong)] p-4">
          <div class="mb-3 text-sm text-[var(--app-muted)]">Тема</div>
          <B24FieldGroup>
            <B24Button :active="theme === 'light'" @click="applyTheme('light')">
              Светлая
            </B24Button>
            <B24Button :active="theme === 'dark'" @click="applyTheme('dark')">
              Темная
            </B24Button>
          </B24FieldGroup>
        </div>

        <div
          class="flex items-end justify-between rounded-[22px] bg-[var(--app-surface-strong)] px-4 py-5"
        >
          <span class="text-sm text-[var(--app-muted)]"
            >Активных сотрудников</span
          >
          <strong class="text-3xl font-semibold">{{
            activeEmployees.length
          }}</strong>
        </div>
      </div>
    </section>

    <B24Alert v-if="state.error" type="error" class="mb-4">
      {{ state.error }}
    </B24Alert>

    <div
      v-if="state.loading"
      class="rounded-[24px] border border-[var(--app-border)] bg-[var(--app-surface)] p-6 text-sm text-[var(--app-muted)] shadow-[var(--app-shadow)]"
    >
      Загрузка данных...
    </div>

    <template v-else-if="state.data">
      <div class="mb-5">
        <B24Tabs v-model="state.activeTab" :items="tabs" />
      </div>

      <template v-if="state.activeTab === 'schedule'">
        <section class="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_360px]">
          <div
            class="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]"
          >
            <div
              class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div>
                <p
                  class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]"
                >
                  Расписание
                </p>
                <h2 class="text-2xl font-semibold">{{ weekLabel }}</h2>
                <p class="mt-2 text-sm text-[var(--app-muted)]">
                  {{ monthLabel }}
                </p>
              </div>

              <div class="flex gap-2">
                <B24Button @click="moveWeek(-1)">←</B24Button>
                <B24Button @click="moveWeek(1)">→</B24Button>
              </div>
            </div>

            <div v-if="isCurrentWeek && hiddenPastDaysCount" class="mb-4">
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

            <div class="overflow-x-auto">
              <table
                class="min-w-[760px] w-full border-separate border-spacing-y-3"
              >
                <thead>
                  <tr>
                    <th
                      class="px-3 pb-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-muted)]"
                    >
                      Сотрудник
                    </th>
                    <th
                      v-for="date in visibleWeekDays"
                      :key="formatIsoDate(date)"
                      class="px-3 pb-2 text-left"
                    >
                      <div class="flex flex-col gap-1">
                        <span
                          class="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-muted)]"
                        >
                          {{ getWeekdayLabel(date) }}
                        </span>
                        <strong class="text-sm font-semibold">
                          {{ formatDisplayDate(date) }}
                        </strong>
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in scheduleRows" :key="row.employee.id">
                    <td
                      class="rounded-l-[20px] border-y border-l border-[var(--app-border)] bg-[var(--app-surface-strong)] px-3 py-4 font-semibold"
                    >
                      {{ row.employee.name }}
                    </td>
                    <td
                      v-for="cell in row.cells"
                      :key="cell.isoDate"
                      class="border-y border-[var(--app-border)] bg-[var(--app-surface-strong)] px-3 py-4 last:rounded-r-[20px] last:border-r"
                    >
                      <div
                        v-if="cell.assignment"
                        class="flex min-h-[88px] flex-col items-start gap-2"
                      >
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

          <div
            class="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]"
          >
            <div class="mb-5">
              <p
                class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]"
              >
                История
              </p>
              <h2 class="text-2xl font-semibold">Последние замены</h2>
            </div>

            <div class="grid gap-3">
              <article
                v-for="entry in replacementHistory"
                :key="entry.id"
                class="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-4"
              >
                <h3 class="text-base font-semibold">
                  {{ formatDisplayDate(new Date(entry.date)) }}
                </h3>
                <p class="mt-2 text-sm leading-6 text-[var(--app-muted)]">
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
                <p class="mt-3 text-sm text-[var(--app-muted)]">
                  {{ entry.reason || "Без комментария" }}
                </p>
              </article>

              <p
                v-if="!replacementHistory.length"
                class="text-sm text-[var(--app-muted)]"
              >
                Пока замен не было.
              </p>
            </div>
          </div>
        </section>
      </template>

      <template
        v-else-if="state.activeTab === 'settings' && state.mode === 'edit'"
      >
        <section class="grid gap-5 xl:grid-cols-2">
          <div
            class="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]"
          >
            <div class="mb-5">
              <p
                class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]"
              >
                Основные настройки
              </p>
              <h2 class="text-2xl font-semibold">Компания и данные</h2>
            </div>

            <div class="grid gap-4">
              <label class="grid gap-2">
                <span class="text-sm text-[var(--app-muted)]"
                  >Название компании</span
                >
                <B24Input v-model="state.data.company.name" />
              </label>

              <label class="grid gap-2">
                <span class="text-sm text-[var(--app-muted)]"
                  >Направление круга</span
                >
                <B24Select
                  v-model="state.data.schedule.rotationDirection"
                  :items="rotationDirectionItems"
                />
              </label>
            </div>

            <div class="mt-5 flex flex-wrap gap-2">
              <B24Button color="air-tertiary" @click="triggerImport">
                Импорт JSON
              </B24Button>
              <B24Button color="air-tertiary" @click="exportJson">
                Экспорт JSON
              </B24Button>
              <B24Button color="air-danger" @click="resetToRepositoryState">
                Сбросить к версии из Git
              </B24Button>
            </div>

            <input
              ref="importFileInput"
              type="file"
              accept="application/json"
              class="sr-only"
              @change="handleImport"
            />
          </div>

          <div
            class="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]"
          >
            <div
              class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
            >
              <div>
                <p
                  class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]"
                >
                  Ротация команды
                </p>
                <h2 class="text-2xl font-semibold">Сотрудники</h2>
              </div>
              <B24Button @click="addEmployee">Добавить</B24Button>
            </div>

            <p class="mb-4 text-sm leading-6 text-[var(--app-muted)]">
              Порядок круга:
              {{
                state.data.schedule.rotationOrder
                  .map((employeeId) => employeeMap.get(employeeId)?.name)
                  .filter(Boolean)
                  .join(" → ")
              }}
            </p>

            <div class="grid gap-3">
              <article
                v-for="employee in state.data.employees"
                :key="employee.id"
                class="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-4"
              >
                <div class="grid gap-4">
                  <label class="grid gap-2">
                    <span class="text-sm text-[var(--app-muted)]">Имя</span>
                    <B24Input v-model="employee.name" />
                  </label>

                  <label
                    class="flex items-center gap-3 text-sm text-[var(--app-muted)]"
                  >
                    <B24Checkbox v-model="employee.active" />
                    <span>Участвует в ротации</span>
                  </label>

                  <div>
                    <B24Button
                      color="air-tertiary"
                      @click="removeEmployee(employee.id)"
                    >
                      Удалить
                    </B24Button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </section>
      </template>

      <template v-else-if="state.activeTab === 'duties'">
        <section
          class="rounded-[28px] border border-[var(--app-border)] bg-[var(--app-surface)] p-5 shadow-[var(--app-shadow)]"
        >
          <div
            class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div>
              <p
                class="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]"
              >
                Обязанности
              </p>
              <h2 class="text-2xl font-semibold">Что нужно сделать</h2>
            </div>
            <B24Button v-if="state.mode === 'edit'" @click="addDuty">
              Добавить
            </B24Button>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <article
              v-for="duty in state.data.duties"
              :key="duty.id"
              class="rounded-[20px] border border-[var(--app-border)] bg-[var(--app-surface-strong)] p-4"
            >
              <template v-if="state.mode === 'edit'">
                <div class="grid gap-4">
                  <label class="grid gap-2">
                    <span class="text-sm text-[var(--app-muted)]"
                      >Заголовок</span
                    >
                    <B24Input v-model="duty.title" />
                  </label>

                  <label class="grid gap-2">
                    <span class="text-sm text-[var(--app-muted)]"
                      >Описание</span
                    >
                    <B24Textarea v-model="duty.description" rows="3" />
                  </label>

                  <div>
                    <B24Button
                      color="air-tertiary"
                      @click="removeDuty(duty.id)"
                    >
                      Удалить
                    </B24Button>
                  </div>
                </div>
              </template>

              <template v-else>
                <h3 class="text-lg font-semibold">{{ duty.title }}</h3>
                <p class="mt-3 text-sm leading-6 text-[var(--app-muted)]">
                  {{ duty.description }}
                </p>
              </template>
            </article>
          </div>
        </section>
      </template>
    </template>

    <B24Modal v-model:open="showReplacementModal" title="Ручная замена">
      <template #body>
        <div class="grid gap-4">
          <p class="text-sm text-[var(--app-muted)]">
            {{ formatDisplayDate(new Date(state.replacementDraft.date)) }}
          </p>

          <label class="grid gap-2">
            <span class="text-sm text-[var(--app-muted)]">Новый дежурный</span>
            <B24Select
              v-model="state.replacementDraft.employeeId"
              :items="employeeItems"
            />
          </label>

          <label class="grid gap-2">
            <span class="text-sm text-[var(--app-muted)]">Причина замены</span>
            <B24Textarea
              v-model="state.replacementDraft.reason"
              rows="3"
              placeholder="Например: отпуск, больничный, обмен сменами"
            />
          </label>
        </div>
      </template>

      <template #footer>
        <B24Button color="air-tertiary" @click="showReplacementModal = false">
          Отмена
        </B24Button>
        <B24Button @click="saveReplacement">Сохранить замену</B24Button>
      </template>
    </B24Modal>
  </main>
</template>
