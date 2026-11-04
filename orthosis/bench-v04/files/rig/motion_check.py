"""Exact continuous rotational separation and sampled off-axis placement check.

Used by build_rig.py. CadQuery lengths are in millimetres, volumes in mm³.
"""
from math import hypot
import cadquery as cq

VOLUME_TOL = 1e-5
AXIS = (0, 0, 1)
ORIGIN = (0, 0, 0)


def cyl(radius, z, height):
    return cq.Solid.makeCylinder(radius, height, cq.Vector(0, 0, z))


def ring(z, height, outer, inner):
    return cyl(outer, z, height).cut(cyl(inner, z, height))


def check_rotation(parts):
    """Prove separation for all angles from rotational symmetry inside an exact clip."""
    rotor = {n:s for n,s,moving,_ in parts if moving}
    fixed = {n:s for n,s,moving,_ in parts if not moving}
    bounds = cyl(18, -1, 56)
    outside = {name: round(solid.cut(bounds).Volume(), 8) for name,solid in rotor.items()}
    assert max(outside.values()) < VOLUME_TOL, outside

    # All moving geometry is inside the r18 cylinder. Replace every stationary
    # part within that cylinder by its exact axisymmetric CAD profile.
    profile_sections = [
        (8,5,18,6.55),(13,1,18,4.7),(14,3,10,4.7),(17,5,10,6.55)
    ]
    body = ring(*profile_sections[0])
    for section in profile_sections[1:]:
        body = body.fuse(ring(*section))
    profile = {
        'D01_base':body,
        'bearing_8':ring(8,5,6.5,2),
        'bearing_17':ring(17,5,6.5,2),
    }
    difference = {}
    for name,solid in fixed.items():
        near = solid.intersect(bounds)
        if name in profile:
            ideal = profile[name]
            error = near.cut(ideal).Volume() + ideal.cut(near).Volume()
        else:
            error = near.Volume()  # all mounting feet outside the rotor cylinder
        assert abs(error) < VOLUME_TOL, (name, error)
        difference[name] = round(error,8)
    # The stationary inner profile is invariant under *every* Z rotation.
    # Testing each neutral rotor part against it is enough for the continuous sweep.
    max_overlap = 0.0
    for moving_name,solid in rotor.items():
        for fixed_name,stationary in profile.items():
            volume = solid.intersect(stationary).Volume()
            assert abs(volume) < VOLUME_TOL, (moving_name,fixed_name,volume)
            max_overlap = max(max_overlap,volume)

    # Independently test the nonaxisymmetric upper guide bodies versus the upper
    # rotor, with the exact stepped CAD and neutral angle already applied.
    # The clipping box starts at x=41, z=14, above the top of the baseplate.
    clip = cq.Solid.makeBox(14,42,33,cq.Vector(41,-21,14))
    guides = fixed['D01_base'].intersect(clip)
    assert len(guides.Solids()) == 2
    upper_names=['B04','D02_wheel','HUB_1997','shaft','hub_grub',*[f'M3_{i}' for i in range(4)]]
    upper = cq.Compound.makeCompound([rotor[n] for n in upper_names])
    samples = list(range(-120,121,5))
    highest = 0.0
    for angle in samples:
        tested = upper.rotate(ORIGIN,AXIS,angle) if angle else upper
        overlap = tested.intersect(guides).Volume()
        assert abs(overlap) < VOLUME_TOL, (angle,overlap)
        highest = max(highest,overlap)

    # Nearest guide point in plan lies on the rounded inlet corner (R1.5).
    # 'at least' bounds remain valid between samples and under all angular phases.
    guide_r = hypot(43.5,8.5)-1.5
    clearance = {
        'B04_flange_to_guides_xy':guide_r-17,
        'wheel_to_guides_xy':guide_r-10.5,
        'M3_shanks_to_guides_xy':guide_r-(6.35+1.5),
        'M3_heads_to_guides_3D':hypot(guide_r-(6.35+2.75),50-41.8),
        'B04_flange_to_fixed_boss_axial':27-22,
        'wheel_to_fixed_boss_axial':41-22,
        'M3_shanks_to_fixed_boss_axial':25-22,
        'M3_heads_to_fixed_boss_axial':50-22,
        'hub_to_fixed_boss_axial':23-22,
        'shaft_to_printed_body_radial_min':4.7-2,
        'shaft_to_bearing_bore_nominal_radial_contact':0,
        'shaft_to_B04_and_wheel_bores_radial':2.3-2,
        'table_to_collar_axial':2,
        'cord_eye_inner_edge_to_wheel_radial':13.65-1.35-10.5,
    }
    return {
        'neutral_CAD_angle_deg':225,
        'continuous_sweep_deg':[0,360],
        'rotor_limit_radius_mm':18,
        'rotor_outside_volume_mm3':outside,
        'fixed_axisymmetric_profiles_inside_rotor_limit_delta_mm3':difference,
        'stationary_profiles_sections_z_height_outer_and_inner_radii_mm':profile_sections,
        'worst_continuous_overlap_mm3':round(max_overlap,8),
        'moving_parts':list(rotor),'fixed_parts':list(fixed),
        'independent_exact_upper_rotor_vs_two_guides_deg':samples,
        'sampled_upper_rotor_part_names':upper_names,
        'sampled_worst_overlap_mm3':round(highest,8),
        'volume_tolerance_mm3':VOLUME_TOL,
        'nominal_clearance_lower_bounds_mm':{k:round(v,4) for k,v in clearance.items()},
        'scope':'Rigid CAD only. Flexible cord tails, knots, printer tolerances and elastic behaviour excluded.'
    }
