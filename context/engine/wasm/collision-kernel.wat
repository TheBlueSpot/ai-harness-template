(module
  (func $clamp (param $v f64) (param $min f64) (param $max f64) (result f64)
    local.get $v
    local.get $min
    f64.max
    local.get $max
    f64.min)

  (func (export "circle_rect_overlap")
    (param $cx f64) (param $cy f64) (param $r f64)
    (param $rx f64) (param $ry f64) (param $rw f64) (param $rh f64)
    (result i32)
    (local $closestX f64)
    (local $closestY f64)
    (local $dx f64)
    (local $dy f64)
    local.get $cx
    local.get $rx
    local.get $rx
    local.get $rw
    f64.add
    call $clamp
    local.set $closestX
    local.get $cy
    local.get $ry
    local.get $ry
    local.get $rh
    f64.add
    call $clamp
    local.set $closestY
    local.get $cx
    local.get $closestX
    f64.sub
    local.set $dx
    local.get $cy
    local.get $closestY
    f64.sub
    local.set $dy
    local.get $dx
    local.get $dx
    f64.mul
    local.get $dy
    local.get $dy
    f64.mul
    f64.add
    local.get $r
    local.get $r
    f64.mul
    f64.le)
)
