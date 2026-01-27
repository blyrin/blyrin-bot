<script lang="ts" setup>
const route = useRoute()
const sidebarOpen = ref(false)

const navItems = [
  { href: '/logs', label: '日志', icon: 'i-heroicons-document-text' },
  { href: '/bot', label: '机器人', icon: 'i-heroicons-cog-6-tooth' },
  { href: '/ai', label: 'AI 配置', icon: 'i-heroicons-cpu-chip' },
  { href: '/prompts', label: '提示词', icon: 'i-heroicons-sparkles' },
  { href: '/tools', label: '工具管理', icon: 'i-heroicons-wrench' },
  { href: '/groups', label: '群管理', icon: 'i-heroicons-user-group' },
  { href: '/data', label: '数据管理', icon: 'i-heroicons-circle-stack' },
]

async function handleLogout() {
  await $fetch('/api/auth/logout', { method: 'POST' })
  navigateTo('/login')
}
</script>

<template>
  <div class="min-h-screen bg-neutral-50 dark:bg-neutral-900">
    <!-- 移动端头部 -->
    <header
      class="md:hidden fixed top-0 left-0 right-0 h-14 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 z-40 flex items-center px-4 rounded-b-md">
      <UButton class="cursor-pointer" icon="i-heroicons-bars-3" variant="ghost" @click="sidebarOpen = true" />
      <h1 class="ml-3 text-lg font-bold">Blyrin Bot</h1>
    </header>

    <!-- 侧边栏 -->
    <USlideover v-model:open="sidebarOpen" class="md:hidden" side="left">
      <template #content>
        <div class="flex flex-col h-full bg-white dark:bg-neutral-800">
          <div class="p-6 border-b border-neutral-200 dark:border-neutral-700 rounded-b-md">
            <h1 class="text-xl font-bold">Blyrin Bot</h1>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">管理控制台</p>
          </div>
          <nav class="flex-1 p-4 overflow-y-auto">
            <ul class="space-y-1">
              <li v-for="item in navItems" :key="item.href">
                <NuxtLink
                  :class="route.path === item.href ? 'bg-primary-500 text-white' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'"
                  :to="item.href"
                  class="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors"
                  @click="sidebarOpen = false"
                >
                  <UIcon :name="item.icon" class="w-5 h-5" />
                  {{ item.label }}
                </NuxtLink>
              </li>
            </ul>
          </nav>
          <div class="p-2 flex items-center space-x-2 border-t border-neutral-200 dark:border-neutral-700 rounded-t-md">
            <UButton class="w-full justify-start cursor-pointer" size="lg" variant="ghost" @click="handleLogout">
              <UIcon class="w-5 h-5" name="i-heroicons-arrow-right-on-rectangle" />
              退出登录
            </UButton>
            <ColorModeToggle class="cursor-pointer" />
          </div>
        </div>
      </template>
    </USlideover>

    <!-- 桌面端侧边栏 -->
    <aside
      class="hidden md:flex w-64 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 h-screen flex-col fixed rounded-r-md">
      <div class="p-6 border-b border-neutral-200 dark:border-neutral-700">
        <h1 class="text-xl font-bold">Blyrin Bot</h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400">管理控制台</p>
      </div>
      <nav class="flex-1 p-4">
        <ul class="space-y-1">
          <li v-for="item in navItems" :key="item.href">
            <NuxtLink
              :class="route.path === item.href ? 'bg-primary-500 text-white' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'"
              :to="item.href"
              class="flex items-center gap-3 px-3 py-3 rounded-md text-sm font-medium transition-colors"
            >
              <UIcon :name="item.icon" class="w-5 h-5" />
              {{ item.label }}
            </NuxtLink>
          </li>
        </ul>
      </nav>
      <div class="p-2 flex items-center space-x-2 border-t border-neutral-200 dark:border-neutral-700">
        <UButton class="w-full justify-start cursor-pointer" size="lg" variant="ghost" @click="handleLogout">
          <UIcon class="w-5 h-5" name="i-heroicons-arrow-right-on-rectangle" />
          退出登录
        </UButton>
        <ColorModeToggle class="cursor-pointer" />
      </div>
    </aside>

    <!-- 主内容区 -->
    <main class="md:ml-64 pt-14 md:pt-0 min-h-screen">
      <div class="p-6 mx-auto container">
        <slot />
      </div>
    </main>
  </div>
</template>
