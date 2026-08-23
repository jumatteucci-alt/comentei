import subprocess
import textwrap

# Reuse the patch payload from the original workflow commit so the runner stays tiny.
source = subprocess.check_output([
    "git", "show", "891aaf7dd9baed54f8ffc7156dc82827474ead29:.github/workflows/chatgpt-shape-3d.yml"
], text=True)
start = source.index("python - <<'PY'\n") + len("python - <<'PY'\n")
end = source.index("\n          PY", start)
code = textwrap.dedent(source[start:end])
exec(compile(code, "apply_shape_3d_patch", "exec"), {"__name__": "__main__"})
