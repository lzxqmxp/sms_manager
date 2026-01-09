<script setup lang="ts">
import { ref } from 'vue'
import SmsManager from './components/SmsManager.vue'
import ApiLogs from './components/ApiLogs.vue'

const tab = ref<'manager' | 'logs'>('manager')
</script>

<template>
  <div>
    <div class="top-nav">
      <button :class="['nav-btn', { active: tab==='manager' }]" @click="tab='manager'">短信管理</button>
      <button :class="['nav-btn', { active: tab==='logs' }]" @click="tab='logs'">API 日志</button>
    </div>
    <div v-if="tab==='manager'">
      <SmsManager />
    </div>
    <div v-else>
      <ApiLogs />
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  margin: 0;
  padding: 0;
}

#app {
  width: 100%;
  height: 100vh;
  overflow: auto;
}

.top-nav {
  position: sticky;
  top: 0;
  z-index: 10;
  background: #fff;
  padding: 8px 12px;
  border-bottom: 1px solid #eee;
  display: flex;
  gap: 8px;
}

.nav-btn {
  padding: 8px 14px;
  border: 1px solid #ddd;
  border-radius: 8px;
  background: #fafafa;
  cursor: pointer;
}
.nav-btn.active {
  background: #667eea;
  color: #fff;
  border-color: #667eea;
}
</style>
