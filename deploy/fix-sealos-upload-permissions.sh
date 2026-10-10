#!/usr/bin/env bash
# Fix only the confirmed Sealos app; keep its environment, image and PVC intact.
set -euo pipefail

config_path="${1:?Usage: bash fix-sealos-upload-permissions.sh PRIVATE_KUBECONFIG}"
[[ -f "$config_path" ]] || { echo 'Kubeconfig file not found.' >&2; exit 1; }
command -v kubectl >/dev/null
namespace='ns-ebuettxj'
app='mujian'
expected_image='ghcr.io/tony-xuyang/mujian:92a2eb2416d8d3e7607cd1bf19ddcfd17ceb5ba0'
kube=(kubectl --kubeconfig "$config_path" --namespace "$namespace")

actual_image="$("${kube[@]}" get statefulset "$app" -o jsonpath='{.spec.template.spec.containers[?(@.name=="mujian")].image}')"
[[ "$actual_image" == "$expected_image" ]] || { echo 'The app image changed; inspect the deployment before patching.' >&2; exit 1; }
mount_path="$("${kube[@]}" get statefulset "$app" -o jsonpath='{.spec.template.spec.containers[?(@.name=="mujian")].volumeMounts[*].mountPath}')"
[[ " $mount_path " == *' /data/uploads '* ]] || { echo 'The uploads PVC mount is missing.' >&2; exit 1; }

patch_file="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/sealos-upload-security-context.json"
"${kube[@]}" patch statefulset "$app" --type strategic --patch-file "$patch_file" --dry-run=server -o name
"${kube[@]}" patch statefulset "$app" --type strategic --patch-file "$patch_file" -o name
pod_group="$("${kube[@]}" get pod "$app-0" -o jsonpath='{.spec.securityContext.fsGroup}')"
pod_state="$("${kube[@]}" get pod "$app-0" -o jsonpath='{.status.containerStatuses[?(@.name=="mujian")].state.waiting.reason}')"
if [[ "$pod_group" != 10001 && "$pod_state" == CrashLoopBackOff ]]; then
    # StatefulSet can wait forever for a broken old revision to become ready.
    # Recreate only the app Pod; its PVC and database remain in place.
    "${kube[@]}" delete pod "$app-0" --wait=false
fi
"${kube[@]}" rollout status statefulset/"$app" --timeout=180s
"${kube[@]}" exec "$app-0" -c "$app" -- sh -c 'test "$(id -u)" = 10001 && test "$(id -g)" = 10001 && test -w /data/uploads'
echo 'PASS: the app remains non-root and /data/uploads is writable.'
