"""V02 ideal paired-Bowden 1DOF pulley model (bench concept; not clinical dynamics)."""
from dataclasses import dataclass
from pathlib import Path
import json,math,csv
P=json.loads((Path(__file__).parent/'parameters.json').read_text(encoding='utf-8'))
@dataclass(frozen=True)
class State:
    knee_deg:float
    cable_flex_delta_mm:float
    cable_extend_delta_mm:float
    motor_output_turns:float
    motor_output_deg:float
    ideal_tension_difference_N:float
    motor_output_torque_Nm_assumed:float
    motor_output_rpm_assumed:float
def state(knee_deg,knee_torque_Nm=None,radius_mm=None,spool_mm=None,eff=None,motor_rpm=None):
    R=float(radius_mm or P['joint_pulley_pitch_radius'])
    r=float(spool_mm or P['motor_spool_pitch_radius'])
    eta=float(eff or P['assumed_end_to_end_efficiency'])
    tau=float(P['nominal_demo_joint_torque_Nm'] if knee_torque_Nm is None else knee_torque_Nm)
    rpm=float(motor_rpm or P['assumed_motor_output_speed_rpm'])
    if not (0<=knee_deg<=120 and R>0 and r>0 and 0<eta<=1 and rpm>=0 and tau>=0):
        raise ValueError('Invalid bench scenario')
    s=R*math.radians(knee_deg)
    return State(knee_deg,s,-s,s/(2*math.pi*r),s/r*180/math.pi,1000*tau/R,tau*r/R/eta,rpm)
def export():
    rows=[]
    for deg in range(0,121,5):
        s=state(deg)
        rows.append({k:round(getattr(s,k),6) for k in s.__dataclass_fields__})
    target=Path(__file__).parent/'files'
    target.mkdir(exist_ok=True)
    with (target/'motion_table.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=rows[0].keys());w.writeheader();w.writerows(rows)
    (target/'motion_table.json').write_text(json.dumps({'parameters':P,'rows':rows,'disclaimer':'Ideal geometric linkage: no friction/hysteresis/backlash/continuous-contact/clinical validation.'},ensure_ascii=False,indent=2),encoding='utf-8')
if __name__=='__main__':export()
