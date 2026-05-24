(module
 (type $0 (func (param i32 f32 f32 i32 i32) (result i32)))
 (type $1 (func))
 (type $2 (func (param i32 i32 i32 i32)))
 (type $3 (func (param i32 i32 i32 i32 f32 f32 i32)))
 (type $4 (func (param i32)))
 (type $5 (func (param i32) (result i32)))
 (type $6 (func (param i32 i32) (result i32)))
 (type $7 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
 (type $8 (func (param i32 i32 i32 i32 f32 i32)))
 (type $9 (func (param i32 i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
 (type $10 (func (param f64 f64 f64 f64 f64 f64 f64) (result i32)))
 (import "env" "abort" (func $~lib/builtins/abort (param i32 i32 i32 i32)))
 (global $~lib/rt/stub/offset (mut i32) (i32.const 0))
 (global $~lib/rt/__rtti_base i32 (i32.const 1168))
 (memory $0 1)
 (data $0 (i32.const 1036) "<")
 (data $0.1 (i32.const 1048) "\02\00\00\00(\00\00\00A\00l\00l\00o\00c\00a\00t\00i\00o\00n\00 \00t\00o\00o\00 \00l\00a\00r\00g\00e")
 (data $1 (i32.const 1100) "<")
 (data $1.1 (i32.const 1112) "\02\00\00\00\1e\00\00\00~\00l\00i\00b\00/\00r\00t\00/\00s\00t\00u\00b\00.\00t\00s")
 (data $2 (i32.const 1168) "\04\00\00\00 \00\00\00 \00\00\00 ")
 (export "circle_rect_overlap" (func $assembly/collision-kernel/circle_rect_overlap))
 (export "integrate_movement_f32" (func $assembly/collision-kernel/integrate_movement_f32))
 (export "rotate_points_f32" (func $assembly/collision-kernel/rotate_points_f32))
 (export "rotate_vectors_f32" (func $assembly/collision-kernel/rotate_points_f32))
 (export "range_filter_f32" (func $assembly/collision-kernel/range_filter_f32))
 (export "predicate_filter_mask_f32" (func $assembly/collision-kernel/predicate_filter_mask_f32))
 (export "rect_rect_overlap_batch_f32" (func $assembly/collision-kernel/rect_rect_overlap_batch_f32))
 (export "circle_rect_overlap_batch_f32" (func $assembly/collision-kernel/circle_rect_overlap_batch_f32))
 (export "__new" (func $~lib/rt/stub/__new))
 (export "__pin" (func $~lib/rt/stub/__pin))
 (export "__unpin" (func $~lib/rt/stub/__unpin))
 (export "__collect" (func $~lib/rt/stub/__collect))
 (export "__rtti_base" (global $~lib/rt/__rtti_base))
 (export "memory" (memory $0))
 (start $~start)
 (func $assembly/collision-kernel/rotate_points_f32 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 f32) (param $5 f32) (param $6 i32)
  (local $7 i32)
  (local $8 v128)
  (local $9 v128)
  (local $10 v128)
  (local $11 f32)
  (local $12 v128)
  (local $13 f32)
  (local $14 i32)
  local.get $4
  f32x4.splat
  local.set $8
  local.get $5
  f32x4.splat
  local.set $9
  loop $for-loop|0
   local.get $7
   local.get $6
   i32.const 4
   i32.sub
   i32.le_s
   if
    local.get $0
    local.get $7
    i32.const 2
    i32.shl
    local.tee $14
    i32.add
    v128.load
    local.set $10
    local.get $2
    local.get $14
    i32.add
    local.get $10
    local.get $9
    f32x4.mul
    local.get $1
    local.get $14
    i32.add
    v128.load
    local.tee $12
    local.get $8
    f32x4.mul
    f32x4.sub
    v128.store
    local.get $3
    local.get $14
    i32.add
    local.get $10
    local.get $8
    f32x4.mul
    local.get $12
    local.get $9
    f32x4.mul
    f32x4.add
    v128.store
    local.get $7
    i32.const 4
    i32.add
    local.set $7
    br $for-loop|0
   end
  end
  loop $for-loop|1
   local.get $6
   local.get $7
   i32.gt_s
   if
    local.get $0
    local.get $7
    i32.const 2
    i32.shl
    local.tee $14
    i32.add
    f32.load
    local.set $11
    local.get $2
    local.get $14
    i32.add
    local.get $11
    local.get $5
    f32.mul
    local.get $1
    local.get $14
    i32.add
    f32.load
    local.tee $13
    local.get $4
    f32.mul
    f32.sub
    f32.store
    local.get $3
    local.get $14
    i32.add
    local.get $11
    local.get $4
    f32.mul
    local.get $13
    local.get $5
    f32.mul
    f32.add
    f32.store
    local.get $7
    i32.const 1
    i32.add
    local.set $7
    br $for-loop|1
   end
  end
 )
 (func $assembly/collision-kernel/range_filter_f32 (param $0 i32) (param $1 f32) (param $2 f32) (param $3 i32) (param $4 i32) (result i32)
  (local $5 i32)
  (local $6 i32)
  (local $7 v128)
  (local $8 v128)
  (local $9 v128)
  (local $10 f32)
  (local $11 i32)
  (local $12 i32)
  local.get $1
  f32x4.splat
  local.set $7
  local.get $2
  f32x4.splat
  local.set $8
  loop $for-loop|0
   local.get $5
   local.get $4
   i32.const 4
   i32.sub
   i32.le_s
   if
    local.get $3
    local.get $5
    i32.add
    local.tee $12
    local.get $0
    local.get $5
    i32.const 2
    i32.shl
    i32.add
    v128.load
    local.tee $9
    local.get $7
    f32x4.ge
    local.get $9
    local.get $8
    f32x4.le
    v128.and
    i32x4.bitmask
    local.tee $11
    i32.const 1
    i32.and
    i32.store8
    local.get $12
    local.get $11
    i32.const 2
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=1
    local.get $12
    local.get $11
    i32.const 4
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=2
    local.get $12
    local.get $11
    i32.const 8
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=3
    local.get $6
    local.get $11
    i32.popcnt
    i32.add
    local.set $6
    local.get $5
    i32.const 4
    i32.add
    local.set $5
    br $for-loop|0
   end
  end
  loop $for-loop|1
   local.get $4
   local.get $5
   i32.gt_s
   if
    local.get $3
    local.get $5
    i32.add
    local.get $0
    local.get $5
    i32.const 2
    i32.shl
    i32.add
    f32.load
    local.tee $10
    local.get $1
    f32.ge
    local.get $2
    local.get $10
    f32.ge
    i32.and
    local.tee $11
    i32.store8
    local.get $6
    local.get $11
    i32.add
    local.set $6
    local.get $5
    i32.const 1
    i32.add
    local.set $5
    br $for-loop|1
   end
  end
  local.get $6
 )
 (func $~start
  i32.const 1196
  global.set $~lib/rt/stub/offset
 )
 (func $~lib/rt/stub/__unpin (param $0 i32)
 )
 (func $~lib/rt/stub/__pin (param $0 i32) (result i32)
  local.get $0
 )
 (func $~lib/rt/stub/__new (param $0 i32) (param $1 i32) (result i32)
  (local $2 i32)
  (local $3 i32)
  (local $4 i32)
  (local $5 i32)
  (local $6 i32)
  local.get $0
  i32.const 1073741804
  i32.gt_u
  if
   i32.const 1056
   i32.const 1120
   i32.const 86
   i32.const 30
   call $~lib/builtins/abort
   unreachable
  end
  local.get $0
  i32.const 16
  i32.add
  local.tee $3
  i32.const 1073741820
  i32.gt_u
  if
   i32.const 1056
   i32.const 1120
   i32.const 33
   i32.const 29
   call $~lib/builtins/abort
   unreachable
  end
  global.get $~lib/rt/stub/offset
  i32.const 4
  i32.add
  local.tee $2
  local.get $3
  i32.const 19
  i32.add
  i32.const -16
  i32.and
  i32.const 4
  i32.sub
  local.tee $3
  i32.add
  local.tee $4
  memory.size
  local.tee $5
  i32.const 16
  i32.shl
  i32.const 15
  i32.add
  i32.const -16
  i32.and
  local.tee $6
  i32.gt_u
  if
   local.get $5
   local.get $4
   local.get $6
   i32.sub
   i32.const 65535
   i32.add
   i32.const -65536
   i32.and
   i32.const 16
   i32.shr_u
   local.tee $6
   local.get $5
   local.get $6
   i32.gt_s
   select
   memory.grow
   i32.const 0
   i32.lt_s
   if
    local.get $6
    memory.grow
    i32.const 0
    i32.lt_s
    if
     unreachable
    end
   end
  end
  global.get $~lib/rt/stub/offset
  local.get $4
  global.set $~lib/rt/stub/offset
  local.get $3
  i32.store
  local.get $2
  i32.const 4
  i32.sub
  local.tee $3
  i32.const 0
  i32.store offset=4
  local.get $3
  i32.const 0
  i32.store offset=8
  local.get $3
  local.get $1
  i32.store offset=12
  local.get $3
  local.get $0
  i32.store offset=16
  local.get $2
  i32.const 16
  i32.add
 )
 (func $~lib/rt/stub/__collect
 )
 (func $assembly/collision-kernel/rect_rect_overlap_batch_f32 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (param $9 i32) (result i32)
  (local $10 i32)
  (local $11 i32)
  (local $12 v128)
  (local $13 f32)
  (local $14 f32)
  (local $15 i32)
  (local $16 i32)
  (local $17 v128)
  loop $for-loop|0
   local.get $10
   local.get $9
   i32.const 4
   i32.sub
   i32.le_s
   if
    local.get $8
    local.get $10
    i32.add
    local.tee $15
    local.get $10
    i32.const 2
    i32.shl
    local.tee $16
    local.get $0
    i32.add
    v128.load
    local.tee $12
    local.get $4
    local.get $16
    i32.add
    v128.load
    local.tee $17
    local.get $6
    local.get $16
    i32.add
    v128.load
    f32x4.add
    f32x4.lt
    local.get $12
    local.get $2
    local.get $16
    i32.add
    v128.load
    f32x4.add
    local.get $17
    f32x4.gt
    v128.and
    local.get $1
    local.get $16
    i32.add
    v128.load
    local.tee $12
    local.get $5
    local.get $16
    i32.add
    v128.load
    local.tee $17
    local.get $7
    local.get $16
    i32.add
    v128.load
    f32x4.add
    f32x4.lt
    local.get $12
    local.get $3
    local.get $16
    i32.add
    v128.load
    f32x4.add
    local.get $17
    f32x4.gt
    v128.and
    v128.and
    i32x4.bitmask
    local.tee $16
    i32.const 1
    i32.and
    i32.store8
    local.get $15
    local.get $16
    i32.const 2
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=1
    local.get $15
    local.get $16
    i32.const 4
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=2
    local.get $15
    local.get $16
    i32.const 8
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=3
    local.get $11
    local.get $16
    i32.popcnt
    i32.add
    local.set $11
    local.get $10
    i32.const 4
    i32.add
    local.set $10
    br $for-loop|0
   end
  end
  loop $for-loop|1
   local.get $9
   local.get $10
   i32.gt_s
   if
    local.get $8
    local.get $10
    i32.add
    local.get $10
    i32.const 2
    i32.shl
    local.tee $15
    local.get $0
    i32.add
    f32.load
    local.tee $13
    local.get $4
    local.get $15
    i32.add
    f32.load
    local.tee $14
    local.get $6
    local.get $15
    i32.add
    f32.load
    f32.add
    f32.lt
    if (result i32)
     local.get $13
     local.get $2
     local.get $15
     i32.add
     f32.load
     f32.add
     local.get $14
     f32.gt
    else
     i32.const 0
    end
    if (result i32)
     local.get $1
     local.get $15
     i32.add
     f32.load
     local.get $5
     local.get $15
     i32.add
     f32.load
     local.get $7
     local.get $15
     i32.add
     f32.load
     f32.add
     f32.lt
    else
     i32.const 0
    end
    if (result i32)
     local.get $5
     local.get $15
     i32.add
     f32.load
     local.get $1
     local.get $15
     i32.add
     f32.load
     local.get $3
     local.get $15
     i32.add
     f32.load
     f32.add
     f32.lt
    else
     i32.const 0
    end
    local.tee $15
    i32.store8
    local.get $11
    local.get $15
    i32.add
    local.set $11
    local.get $10
    i32.const 1
    i32.add
    local.set $10
    br $for-loop|1
   end
  end
  local.get $11
 )
 (func $assembly/collision-kernel/predicate_filter_mask_f32 (param $0 i32) (param $1 f32) (param $2 f32) (param $3 i32) (param $4 i32) (result i32)
  local.get $0
  local.get $1
  local.get $2
  local.get $3
  local.get $4
  call $assembly/collision-kernel/range_filter_f32
 )
 (func $assembly/collision-kernel/integrate_movement_f32 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 f32) (param $5 i32)
  (local $6 i32)
  (local $7 v128)
  (local $8 i32)
  (local $9 i32)
  local.get $4
  f32x4.splat
  local.set $7
  loop $for-loop|0
   local.get $6
   local.get $5
   i32.const 4
   i32.sub
   i32.le_s
   if
    local.get $6
    i32.const 2
    i32.shl
    local.tee $8
    local.get $0
    i32.add
    local.tee $9
    local.get $9
    v128.load
    local.get $2
    local.get $8
    i32.add
    v128.load
    local.get $7
    f32x4.mul
    f32x4.add
    v128.store
    local.get $1
    local.get $8
    i32.add
    local.tee $9
    local.get $9
    v128.load
    local.get $3
    local.get $8
    i32.add
    v128.load
    local.get $7
    f32x4.mul
    f32x4.add
    v128.store
    local.get $6
    i32.const 4
    i32.add
    local.set $6
    br $for-loop|0
   end
  end
  loop $for-loop|1
   local.get $5
   local.get $6
   i32.gt_s
   if
    local.get $6
    i32.const 2
    i32.shl
    local.tee $8
    local.get $0
    i32.add
    local.tee $9
    local.get $9
    f32.load
    local.get $2
    local.get $8
    i32.add
    f32.load
    local.get $4
    f32.mul
    f32.add
    f32.store
    local.get $1
    local.get $8
    i32.add
    local.tee $9
    local.get $9
    f32.load
    local.get $3
    local.get $8
    i32.add
    f32.load
    local.get $4
    f32.mul
    f32.add
    f32.store
    local.get $6
    i32.const 1
    i32.add
    local.set $6
    br $for-loop|1
   end
  end
 )
 (func $assembly/collision-kernel/circle_rect_overlap_batch_f32 (param $0 i32) (param $1 i32) (param $2 i32) (param $3 i32) (param $4 i32) (param $5 i32) (param $6 i32) (param $7 i32) (param $8 i32) (result i32)
  (local $9 v128)
  (local $10 i32)
  (local $11 f32)
  (local $12 i32)
  (local $13 i32)
  (local $14 i32)
  (local $15 f32)
  loop $for-loop|0
   local.get $10
   local.get $8
   i32.const 4
   i32.sub
   i32.le_s
   if
    local.get $7
    local.get $10
    i32.add
    local.tee $13
    local.get $10
    i32.const 2
    i32.shl
    local.tee $14
    local.get $0
    i32.add
    v128.load
    local.tee $9
    local.get $9
    local.get $3
    local.get $14
    i32.add
    v128.load
    local.tee $9
    f32x4.max
    local.get $9
    local.get $5
    local.get $14
    i32.add
    v128.load
    f32x4.add
    f32x4.min
    f32x4.sub
    local.tee $9
    local.get $9
    f32x4.mul
    local.get $1
    local.get $14
    i32.add
    v128.load
    local.tee $9
    local.get $9
    local.get $4
    local.get $14
    i32.add
    v128.load
    local.tee $9
    f32x4.max
    local.get $9
    local.get $6
    local.get $14
    i32.add
    v128.load
    f32x4.add
    f32x4.min
    f32x4.sub
    local.tee $9
    local.get $9
    f32x4.mul
    f32x4.add
    local.get $2
    local.get $14
    i32.add
    v128.load
    local.tee $9
    local.get $9
    f32x4.mul
    f32x4.le
    i32x4.bitmask
    local.tee $14
    i32.const 1
    i32.and
    i32.store8
    local.get $13
    local.get $14
    i32.const 2
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=1
    local.get $13
    local.get $14
    i32.const 4
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=2
    local.get $13
    local.get $14
    i32.const 8
    i32.and
    i32.const 0
    i32.ne
    i32.store8 offset=3
    local.get $12
    local.get $14
    i32.popcnt
    i32.add
    local.set $12
    local.get $10
    i32.const 4
    i32.add
    local.set $10
    br $for-loop|0
   end
  end
  loop $for-loop|1
   local.get $8
   local.get $10
   i32.gt_s
   if
    local.get $7
    local.get $10
    i32.add
    local.get $10
    i32.const 2
    i32.shl
    local.tee $13
    local.get $0
    i32.add
    f32.load
    local.tee $11
    local.get $3
    local.get $13
    i32.add
    f32.load
    local.tee $15
    local.get $5
    local.get $13
    i32.add
    f32.load
    f32.add
    local.get $11
    local.get $15
    f32.max
    f32.min
    f32.sub
    local.tee $11
    local.get $11
    f32.mul
    local.get $1
    local.get $13
    i32.add
    f32.load
    local.tee $11
    local.get $4
    local.get $13
    i32.add
    f32.load
    local.tee $15
    local.get $6
    local.get $13
    i32.add
    f32.load
    f32.add
    local.get $11
    local.get $15
    f32.max
    f32.min
    f32.sub
    local.tee $11
    local.get $11
    f32.mul
    f32.add
    local.get $2
    local.get $13
    i32.add
    f32.load
    local.tee $11
    local.get $11
    f32.mul
    f32.le
    local.tee $13
    i32.store8
    local.get $12
    local.get $13
    i32.add
    local.set $12
    local.get $10
    i32.const 1
    i32.add
    local.set $10
    br $for-loop|1
   end
  end
  local.get $12
 )
 (func $assembly/collision-kernel/circle_rect_overlap (param $0 f64) (param $1 f64) (param $2 f64) (param $3 f64) (param $4 f64) (param $5 f64) (param $6 f64) (result i32)
  local.get $0
  local.get $3
  local.get $5
  f64.add
  local.get $0
  local.get $3
  f64.max
  f64.min
  f64.sub
  local.tee $0
  local.get $0
  f64.mul
  local.get $1
  local.get $4
  local.get $6
  f64.add
  local.get $1
  local.get $4
  f64.max
  f64.min
  f64.sub
  local.tee $0
  local.get $0
  f64.mul
  f64.add
  local.get $2
  local.get $2
  f64.mul
  f64.le
 )
)
