<script lang="ts" setup>
definePageMeta({
  layout: 'auth',
})

const password = ref('')
const error = ref('')
const loading = ref(false)

async function handleSubmit() {
  error.value = ''
  loading.value = true

  try {
    const res = await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password: password.value },
    })

    if (res.success) {
      navigateTo('/')
    } else {
      error.value = '登录失败'
    }
  } catch {
    error.value = '网络错误'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UCard class="w-full max-w-md">
    <template #header>
      <div class="text-center">
        <h1 class="text-2xl font-bold">Blyrin Bot</h1>
        <p class="text-sm text-neutral-500 dark:text-neutral-400 mt-1">请输入密码登录管理控制台</p>
      </div>
    </template>

    <form class="space-y-4" @submit.prevent="handleSubmit">
      <UFormField>
        <UInput
          v-model="password"
          :disabled="loading"
          class="w-full"
          placeholder="请输入密码"
          size="lg"
          type="password"
        />
      </UFormField>

      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

      <UButton class="cursor-pointer" :loading="loading" block size="lg" type="submit">
        {{ loading ? '登录中...' : '登录' }}
      </UButton>
    </form>
  </UCard>
</template>
