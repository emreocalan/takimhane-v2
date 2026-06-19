const dispatch = (type, message) =>
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { type, message, id: Date.now() } }))

const toast = {
  success: (message) => dispatch('success', message),
  error:   (message) => dispatch('error', message),
  info:    (message) => dispatch('info', message),
}

export default toast
