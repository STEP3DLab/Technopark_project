"""Select a signer-disjoint Slovo experiment before observing predictions.

python scripts/prepare_research_v019.py /path/to/annotations.csv
Only annotation metadata is read. Model outputs and tracking quality never
affect selection. The selected manifest is kept in research/v019/selection.json.
"""
from __future__ import annotations
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEED = 'hearing-equality-2026-11-11-v019'
LABELS = {'Привет!': 'hello', 'да': 'yes', 'хорошо': 'good',
          'вопрос': 'question', 'друг': 'friend', 'работать': 'work'}
VALIDATION_SIGNER = '46dd04a1caa75ed3082b573cb5a3ad26'


def rank(value):
    return hashlib.sha256((SEED + ':' + value).encode()).hexdigest()


def select_unknowns(pool, class_count, per_class):
    groups = collections.defaultdict(list)
    for row in pool:
        groups[row['text']].append(row)
    labels = [label for label, items in groups.items()
              if len({r['user_id'] for r in items}) >= per_class]
    selected = []
    for label in sorted(labels, key=rank)[:class_count]:
        used = set()
        for row in sorted(groups[label], key=lambda r: rank(r['attachment_id'])):
            if row['user_id'] not in used:
                selected.append(row)
                used.add(row['user_id'])
                if len(used) == per_class:
                    break
    if len(selected) != class_count * per_class:
        raise ValueError('Insufficient eligible unknown classes')
    return selected


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('annotations', type=Path)
    args = parser.parse_args()
    source_bytes = args.annotations.read_bytes()
    rows = list(csv.DictReader(source_bytes.decode('utf-8-sig').splitlines(), delimiter='\t'))
    if len(rows) != 20400 or len({r['attachment_id'] for r in rows}) != len(rows):
        raise ValueError('Unexpected source annotation version or duplicate clip ids')
    baseline = json.loads((ROOT/'app/assets/recognition-library.json').read_text())['entries']
    historic = json.loads((ROOT/'tests/fixtures/heldout-v07.json').read_text())['entries']
    historic_signers = {r['user_id'] for r in historic}
    baseline_signers = {r['user_id'] for r in baseline}
    known_test = [r for r in rows if r['text'] in LABELS and r['train'] == 'False'
                  and r['user_id'] not in historic_signers | baseline_signers]
    test_signers = {r['user_id'] for r in known_test}
    known_development = [r for r in rows if r['text'] in LABELS and r['train'] == 'True'
                         and r['user_id'] not in historic_signers | test_signers]
    train = [r for r in known_development if r['user_id'] != VALIDATION_SIGNER]
    known_validation = [r for r in known_development if r['user_id'] == VALIDATION_SIGNER]
    if set(r['text'] for r in known_validation) != set(LABELS):
        raise ValueError('Validation signer does not cover every known label')
    train_signers = {r['user_id'] for r in train}
    unknown_validation = select_unknowns(
        [r for r in rows if r['text'] not in LABELS and r['train'] == 'True'
         and r['user_id'] == VALIDATION_SIGNER], 30, 1)
    blocked = train_signers | baseline_signers | historic_signers | {VALIDATION_SIGNER}
    validation_unknown_labels = {r['text'] for r in unknown_validation}
    unknown_test = select_unknowns(
        [r for r in rows if r['text'] not in LABELS and r['train'] == 'False'
         and r['text'] not in validation_unknown_labels and r['user_id'] not in blocked], 30, 2)
    entries = []
    for split, role, items in [('train', 'known', train),
                              ('validation', 'known', known_validation),
                              ('validation', 'unknown', unknown_validation),
                              ('test', 'known', known_test), ('test', 'unknown', unknown_test)]:
        for r in sorted(items, key=lambda x: (x['text'], x['attachment_id'])):
            entries.append({'clip_id': r['attachment_id'], 'user_id': r['user_id'],
                            'text': r['text'], 'id': LABELS.get(r['text'], '__unknown__'),
                            'split': split, 'role': role,
                            'official_split': 'train' if r['train'] == 'True' else 'test',
                            'archive_path': ('train' if r['train'] == 'True' else 'test') + '/' + r['attachment_id'] + '.mp4'})
    user_sets = {split: {r['user_id'] for r in entries if r['split'] == split}
                 for split in ['train', 'validation', 'test']}
    assert not (user_sets['train'] & user_sets['validation'] or user_sets['train'] & user_sets['test']
                or user_sets['validation'] & user_sets['test'])
    assert len(entries) == len({r['clip_id'] for r in entries})
    all_train = {r['user_id'] for r in rows if r['train'] == 'True'}
    all_test = {r['user_id'] for r in rows if r['train'] == 'False'}
    result = {
        'schema_version': 1, 'protocol': 'hearing-equality-v019', 'selection_revision': 2, 'date': '2026-11-11',
        'amendment': 'Revision 2 fixed before any calibration or predictions: exclude all 30 validation unknown labels from the unknown test. Revision 1 had 26 overlapping labels and is retained as superseded metadata.',
        'seed': SEED, 'selection_uses': 'Annotation metadata only; no tracking or model predictions.',
        'source': {'url': 'https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/slovo/slovo.zip',
                   'member': 'annotations.csv', 'sha256': hashlib.sha256(source_bytes).hexdigest(),
                   'rows': len(rows), 'global_official_train_test_signer_overlap': len(all_train & all_test)},
        'known_labels': [{'id': ident, 'text': label} for label, ident in LABELS.items()],
        'historical_holdout': {'clips': len(historic), 'signers_excluded': sorted(historic_signers),
                              'status': 'Previously observed; regression check only, never new test evidence.'},
        'validation_signer': VALIDATION_SIGNER,
        'unknown_validation_test_label_overlap': 0,
        'split_summary': {split: {'clips': sum(r['split'] == split for r in entries),
                                  'signers': len(user_sets[split]),
                                  'known': sum(r['split'] == split and r['role'] == 'known' for r in entries),
                                  'unknown': sum(r['split'] == split and r['role'] == 'unknown' for r in entries)}
                          for split in user_sets},
        'known_test_class_counts': dict(collections.Counter(r['text'] for r in known_test)),
        'limitations': ['No new test signer for friend remains after excluding historic signers.',
                       'Validation has one signer; this is an exploratory engineering experiment.',
                       'Unknown labels are 30 deterministic sampled Slovo classes, not arbitrary movements or connected signing.',
                       'Natural sentences, comprehension of the avatar, and a live browser camera are not measured.'],
        'entries': entries,
    }
    out = ROOT/'research/v019/selection.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
    if out.exists() and out.read_text() != rendered:
        raise ValueError('A different frozen selection exists; use a new protocol version')
    out.write_text(rendered)
    print(json.dumps({'selection_sha256': hashlib.sha256(rendered.encode()).hexdigest(),
                      'summary': result['split_summary'], 'known_test_class_counts': result['known_test_class_counts']},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
