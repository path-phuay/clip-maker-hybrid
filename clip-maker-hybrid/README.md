> clip-maker-schema@0.1.0 test
> node --test tests/

ok 1 - schema file is valid Draft 2020-12
ok 2 - all valid fixtures pass schema validation
ok 3 - all invalid fixtures fail schema validation
ok 4 - cut transition must have duration === 0 (if/then rule)
ok 5 - normalized coordinates reject values outside [0, 1]
ok 6 - schemaVersion pattern enforces major == 2
# tests 6
# pass 6
# fail 0
# cancelled 0
# skipped 0
# todo 0
