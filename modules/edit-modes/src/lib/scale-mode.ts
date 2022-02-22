/* eslint-disable prettier/prettier */
import bbox from '@turf/bbox';
import turfCenterOfMass from '@turf/center-of-mass';
import turfBearing from '@turf/bearing';
import turfTransformRotate from '@turf/transform-rotate';
import bboxPolygon from '@turf/bbox-polygon';
import { point, featureCollection, Feature, Polygon } from '@turf/helpers';
import polygonToLine from '@turf/polygon-to-line';
import { coordEach } from '@turf/meta';
import turfDistance from '@turf/distance';
import turfTransformScale from '@turf/transform-scale';
import { getCoord, getGeom } from '@turf/invariant';
import { FeatureCollection, Position } from '../geojson-types';
import {
  ModeProps,
  PointerMoveEvent,
  StartDraggingEvent,
  StopDraggingEvent,
  DraggingEvent,
  EditHandleFeature,
  GuideFeatureCollection,
} from '../types';
import { getPickedEditHandle } from '../utils';
import { GeoJsonEditMode } from './geojson-edit-mode';
import { ImmutableFeatureCollection } from './immutable-feature-collection';

export class ScaleMode extends GeoJsonEditMode {
  _geometryBeingScaled: FeatureCollection | null | undefined;
  _selectedEditHandle: EditHandleFeature | null | undefined;
  _cornerGuidePoints: Array<EditHandleFeature>;
  _cursor: string | null | undefined;
  _isScaling = false;
  _bearing = 0;

  _isSinglePointGeometrySelected = (geometry: FeatureCollection | null | undefined): boolean => {
    const { features } = geometry || {};
    if (Array.isArray(features) && features.length === 1) {
      // @ts-ignore
      const { type } = getGeom(features[0]);
      return type === 'Point';
    }
    return false;
  };

  _isSingleGeometrySelected = (geometry: FeatureCollection | null | undefined): boolean => {
    const { features } = geometry || {};
    return Array.isArray(features) && features.length === 1;
  };

  _getOppositeScaleHandle = (selectedHandle: EditHandleFeature) => {
    const selectedHandleIndex =
      selectedHandle &&
      selectedHandle.properties &&
      Array.isArray(selectedHandle.properties.positionIndexes) &&
      selectedHandle.properties.positionIndexes[0];

    if (typeof selectedHandleIndex !== 'number') {
      return null;
    }
    const guidePointCount = this._cornerGuidePoints.length;
    const oppositeIndex = (selectedHandleIndex + guidePointCount / 2) % guidePointCount;
    return this._cornerGuidePoints.find((p) => {
      if (!Array.isArray(p.properties.positionIndexes)) {
        return false;
      }
      return p.properties.positionIndexes[0] === oppositeIndex;
    });
  };

  _getUpdatedData = (props: ModeProps<FeatureCollection>, editedData: FeatureCollection) => {
    let updatedData = new ImmutableFeatureCollection(props.data);
    const selectedIndexes = props.selectedIndexes;
    for (let i = 0; i < selectedIndexes.length; i++) {
      const selectedIndex = selectedIndexes[i];
      const movedFeature = editedData.features[i];
      updatedData = updatedData.replaceGeometry(selectedIndex, movedFeature.geometry);
    }
    return updatedData.getObject();
  };

  isEditHandleSelected = (): boolean => Boolean(this._selectedEditHandle);

  getScaleAction = (
    startDragPoint: Position,
    currentPoint: Position,
    editType: string,
    props: ModeProps<FeatureCollection>
  ) => {
    if (!this._selectedEditHandle) {
      return null;
    }

    const oppositeHandle = this._getOppositeScaleHandle(this._selectedEditHandle);
    const origin = getCoord(oppositeHandle);
    // @ts-ignore
    const scaleFactor = getScaleFactor(origin, startDragPoint, currentPoint);
    // @ts-ignore
    const scaledFeatures: FeatureCollection = turfTransformScale(
      // @ts-ignore
      this._geometryBeingScaled,
      scaleFactor,
      { origin }
    );

    return {
      updatedData: this._getUpdatedData(props, scaledFeatures),
      editType,
      editContext: {
        featureIndexes: props.selectedIndexes,
      },
    };
  };

  updateCursor = (props: ModeProps<FeatureCollection>) => {
    if (this._selectedEditHandle) {
      if (this._cursor) {
        props.onUpdateCursor(this._cursor);
      }
      const cursorGeometry = this.getSelectedFeaturesAsFeatureCollection(props);

      const center = turfCenterOfMass(cursorGeometry);
      const bearing = turfBearing(center, this._selectedEditHandle);
      const cursorState = this.getCursorState(bearing, props);
      this._cursor = cursorState;
    } else {
      this._cursor = null;
    }
    props.onUpdateCursor(this._cursor);
  };

  handlePointerMove(event: PointerMoveEvent, props: ModeProps<FeatureCollection>) {
    if (!this._isScaling) {
      const selectedEditHandle = getPickedEditHandle(event.picks);
      this._selectedEditHandle =
        selectedEditHandle && selectedEditHandle.properties.editHandleType === 'scale'
          ? selectedEditHandle
          : null;

      this.updateCursor(props);
    }
  }

  handleStartDragging(event: StartDraggingEvent, props: ModeProps<FeatureCollection>) {
    if (this._selectedEditHandle) {
      this._isScaling = true;
      this._geometryBeingScaled = this.getSelectedFeaturesAsFeatureCollection(props);
    }
  }

  handleDragging(event: DraggingEvent, props: ModeProps<FeatureCollection>) {
    if (!this._isScaling) {
      return;
    }

    props.onUpdateCursor(this._cursor);

    const scaleAction = this.getScaleAction(
      event.pointerDownMapCoords,
      event.mapCoords,
      'scaling',
      props
    );
    if (scaleAction) {
      props.onEdit(scaleAction);
    }

    event.cancelPan();
  }

  handleStopDragging(event: StopDraggingEvent, props: ModeProps<FeatureCollection>) {
    if (this._isScaling) {
      // Scale the geometry
      const scaleAction = this.getScaleAction(
        event.pointerDownMapCoords,
        event.mapCoords,
        'scaled',
        props
      );
      if (scaleAction) {
        props.onEdit(scaleAction);
      }

      props.onUpdateCursor(null);

      this._geometryBeingScaled = null;
      this._selectedEditHandle = null;
      this._cursor = null;
      this._isScaling = false;
    }
  }

  getGuides(props: ModeProps<FeatureCollection>): GuideFeatureCollection {
    this._cornerGuidePoints = [];
    const selectedGeometry = this.getSelectedFeaturesAsFeatureCollection(props);

    this._bearing = (selectedGeometry.features.length && props.modeConfig.bearing) || 0;

    // Add buffer to the enveloping box if a single Point feature is selected
    if (this._isSinglePointGeometrySelected(selectedGeometry)) {
      return { type: 'FeatureCollection', features: [] };
    }

    let boundingBox = bboxPolygon(bbox(selectedGeometry));

    if (this._isSingleGeometrySelected(selectedGeometry)) {
      boundingBox = selectedGeometry.features[0] as Feature<Polygon>;
    } else if (this._bearing) {
      const geometry = {
        ...selectedGeometry,
        features: selectedGeometry.features.map((f) => {
          const pivot = turfCenterOfMass(f.geometry);
          return { ...f, geometry: turfTransformRotate(f.geometry, -this._bearing, { pivot }) };
        }),
      };
      const box = bboxPolygon(bbox(geometry));
      const centroid = turfCenterOfMass(geometry);
      boundingBox = turfTransformRotate(box, this._bearing, { pivot: centroid });
    }

    boundingBox.properties.mode = 'scale';
    const cornerGuidePoints = [];

    coordEach(boundingBox, (coord, coordIndex) => {
      if (coordIndex < 4) {
        // Get corner midpoint guides from the enveloping box
        const cornerPoint = point(coord, {
          guideType: 'editHandle',
          editHandleType: 'scale',
          positionIndexes: [coordIndex],
        });
        cornerGuidePoints.push(cornerPoint);
      }
    });

    this._cornerGuidePoints = cornerGuidePoints;
    // @ts-ignore
    return featureCollection([polygonToLine(boundingBox), ...this._cornerGuidePoints]);
  }
}

function getScaleFactor(centroid: Position, startDragPoint: Position, currentPoint: Position) {
  const startDistance = turfDistance(centroid, startDragPoint);
  const endDistance = turfDistance(centroid, currentPoint);
  return endDistance / startDistance;
}
