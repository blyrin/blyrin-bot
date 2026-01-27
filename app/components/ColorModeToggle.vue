<script lang="ts" setup>
const colorMode = useColorMode()

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <UButton class="cursor-pointer" variant="ghost" @click="toggleColorMode">
    <UIcon
      :name="colorMode.value === 'dark' ? 'i-heroicons-sun' : 'i-heroicons-moon'"
      class="w-5 h-5"
    />
  </UButton>
</template>
