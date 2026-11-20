#!/usr/bin/env python3
"""Check the shipped bench/SHA256SUMS; works with Python's standard library."""
import hashlib
from pathlib import Path
import sys

def verify(root):
    root=Path(root).resolve()
    errors=[]
    lines=(root/'SHA256SUMS').read_text(encoding='utf-8').splitlines()
    seen=set()
    for line in lines:
        try:
            expected,name=line.split('  ',1)
            if len(expected)!=64 or any(c not in '0123456789abcdef' for c in expected):raise ValueError('Invalid SHA-256')
            file=(root/name).resolve()
            if not file.is_relative_to(root) or name in seen:raise ValueError('Unsafe or duplicate path')
            seen.add(name)
            if hashlib.sha256(file.read_bytes()).hexdigest()!=expected:errors.append(name+': SHA-256 mismatch')
        except (OSError,ValueError) as exc:errors.append(str(exc))
    if not lines:errors.append('Empty manifest')
    return len(lines),errors

if __name__=='__main__':
    count,errors=verify(Path(__file__).resolve().parents[1])
    for err in errors:print(err,file=sys.stderr)
    print('%d files checked; %d errors. Physical assembly is not verified.'%(count,len(errors)))
    sys.exit(bool(errors))
